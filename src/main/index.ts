import { app, BrowserWindow, screen, Tray, Menu, nativeImage, ipcMain } from 'electron';
import path from 'path';
import { autoUpdater } from 'electron-updater';
import { setupIpcHandlers } from './ipc-handlers';
import { createOpenAIProvider } from './providers/openai-compatible';
import { createAnthropicProvider } from './providers/anthropic';
import { createToolRegistry } from './tools/registry';
import { loadConfig, saveConfig, getConfig, getActiveProvider, getModelConfig, inferModelMode } from './config';
import { loadSkills } from './skills/loader';
import type { Provider } from './agent/runtime';
import type { ToolRegistry } from './agent/runtime';
import type { ConfirmRequest } from '../shared/types';

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
const toolRegistries = new Map<string, ToolRegistry>();
let saveBoundsTimer: ReturnType<typeof setTimeout> | null = null;

/* ── Auto updater ── */
function setupAutoUpdater(): void {
  // Only check for updates in packaged app, not dev mode
  if (!app.isPackaged) return;

  // Auto-download in background, notify when ready
  autoUpdater.autoDownload = true;

  // Use GH proxy for faster downloads in China
  const origSetFeedURL = autoUpdater.setFeedURL.bind(autoUpdater);
  autoUpdater.setFeedURL = function(options: any) {
    if (options?.url && options.url.includes('github.com')) {
      options.url = options.url.replace('https://github.com', 'https://ghproxy.net/https://github.com');
    }
    return origSetFeedURL(options);
  };
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-available', (info) => {
    mainWindow?.webContents.send('update:available', info.version);
  });

  autoUpdater.on('download-progress', (progress) => {
    mainWindow?.webContents.send('update:progress', progress.percent);
  });

  autoUpdater.on('update-downloaded', () => {
    mainWindow?.webContents.send('update:downloaded');
  });

  autoUpdater.on('error', () => {
    // Silently ignore update errors — never interrupt user
  });

  // Check after a short delay so window is ready
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch(() => {});
  }, 5000);
}

// IPC: trigger update check manually, download, and install
ipcMain.handle('update:check', async () => {
  try {
    const result = await autoUpdater.checkForUpdates();
    return { version: result?.updateInfo.version };
  } catch {
    return { error: '检查更新失败' };
  }
});

ipcMain.handle('update:download', async () => {
  try {
    await autoUpdater.downloadUpdate();
    return { ok: true };
  } catch {
    return { error: '下载失败' };
  }
});

ipcMain.handle('update:install', () => {
  autoUpdater.quitAndInstall();
});

ipcMain.handle('close:choice', async (_event, action: string, remember: boolean) => {
  if (remember) {
    const cfg = getConfig();
    cfg.closeBehavior = action as 'tray' | 'quit';
    await saveConfig();
  }
  if (action === 'tray') {
    mainWindow?.hide();
  } else {
    (app as any).__quitting = true;
    app.quit();
  }
});

function createProvider(modelOverride?: string, options?: { stream?: boolean; maxTokens?: number }): Provider {
  const cfg = getConfig();
  const model = modelOverride || cfg.activeModel;
  const active = cfg.providers.find(p => p.models.some(m => m.name === model)) || getActiveProvider();

  const modelCfg = getModelConfig(model);
  const maxTokens = options?.maxTokens || modelCfg?.maxTokens || cfg.agent.maxTokens;
  const supportsVision = (modelCfg?.mode || inferModelMode(model)) === 'multimodal';

  if (active.id === 'anthropic') {
    return createAnthropicProvider({
      apiKey: active.apiKey || process.env.ANTHROPIC_API_KEY || '',
      model,
      maxTokens,
      supportsVision,
    });
  }

  return createOpenAIProvider({
    baseUrl: active.baseUrl,
    apiKey: active.apiKey,
    model,
    maxTokens,
    supportsVision,
    stream: options?.stream,
  });
}

function getOrCreateTools(sessionId = 'default'): ToolRegistry {
  let registry = toolRegistries.get(sessionId);
  if (!registry) {
    const { BrowserWindow } = require('electron');
    const { getPermissionMode, pendingConfirms } = require('./ipc-handlers');
    registry = createToolRegistry(
      getConfig().agent.workspaceRoot,
      async (request: ConfirmRequest) => {
        if (!mainWindow) return false;
        return new Promise((resolve, reject) => {
          const win = BrowserWindow.getAllWindows()[0];
          if (!win) { reject(new Error('No window')); return; }
          const confirmId = `confirm_${Date.now()}_${Math.random().toString(36).slice(2)}`;
          pendingConfirms.set(confirmId, { sessionId, resolve, reject });
          win.webContents.send('agent:run-status', sessionId, {
            phase: 'waiting_user',
            lastEventAt: Date.now(),
            currentTool: request.toolName,
          });
          win.webContents.send('confirm:show', sessionId, confirmId, request);
        });
      },
      async (questions) => {
        return new Promise((resolve, reject) => {
          const win = BrowserWindow.getAllWindows()[0];
          if (!win) { reject(new Error('No window')); return; }
          const askId = `ask_${Date.now()}_${Math.random().toString(36).slice(2)}`;
          const { pendingAsks } = require('./ipc-handlers');
          pendingAsks.set(askId, { sessionId, resolve, reject });
          win.webContents.send('agent:run-status', sessionId, {
            phase: 'waiting_user',
            lastEventAt: Date.now(),
            currentTool: 'ask_user_question',
          });
          win.webContents.send('ask:show', sessionId, askId, questions);
        });
      },
      () => getPermissionMode(),
    );
    toolRegistries.set(sessionId, registry);
  }
  return registry;
}

function saveWindowBounds(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const bounds = mainWindow.getBounds();
  const cfg = getConfig();
  cfg.window = { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
  saveConfig().catch(() => {});
}

function scheduleSaveWindowBounds(): void {
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.isMaximized()) return;
  if (saveBoundsTimer) clearTimeout(saveBoundsTimer);
  saveBoundsTimer = setTimeout(() => {
    saveBoundsTimer = null;
    saveWindowBounds();
  }, 300);
}

async function loadRenderer(win: BrowserWindow): Promise<void> {
  const devUrl = 'http://localhost:5175';
  const rendererIndex = path.join(__dirname, '../renderer/index.html');

  const launchedForDevServer = process.env.npm_lifecycle_event === 'dev:main';
  if (!app.isPackaged && launchedForDevServer) {
    await win.loadURL(devUrl);
    return;
  }

  await win.loadFile(rendererIndex);
}

function createWindow(): void {
  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize;
  const saved = getConfig().window;

  const iconPath = app.isPackaged
    ? path.join(process.resourcesPath, 'icon.png')
    : path.join(__dirname, '../../resources/icon.png');

  mainWindow = new BrowserWindow({
    x: saved?.x,
    y: saved?.y,
    width: saved?.width || Math.min(1400, Math.floor(sw * 0.85)),
    height: saved?.height || Math.min(900, Math.floor(sh * 0.85)),
    minWidth: 900,
    minHeight: 600,
    title: 'DeepSeek Code',
    icon: iconPath,
    frame: false,
    transparent: false,
    hasShadow: true,
    thickFrame: true,
    backgroundColor: '#f6f3ee',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  void loadRenderer(mainWindow).catch(err => {
    console.error('Failed to load renderer:', err);
  });

  mainWindow.on('resize', scheduleSaveWindowBounds);
  mainWindow.on('move', scheduleSaveWindowBounds);

  mainWindow.on('close', (event) => {
    if ((app as any).__quitting) {
      saveWindowBounds();
      return;
    }
    const behavior = getConfig().closeBehavior || 'ask';
    if (behavior === 'tray') {
      event.preventDefault();
      mainWindow?.hide();
      return;
    }
    if (behavior === 'quit') {
      (app as any).__quitting = true;
      saveWindowBounds();
      return;
    }
    // 'ask': show dialog
    event.preventDefault();
    mainWindow?.webContents.send('close:ask');
  });

  mainWindow.on('closed', () => {
    if (saveBoundsTimer) {
      clearTimeout(saveBoundsTimer);
      saveBoundsTimer = null;
    }
    mainWindow = null;
  });
}

function createTray(): void {
  const trayIconPath = app.isPackaged
    ? path.join(process.resourcesPath, 'icon.png')
    : path.join(__dirname, '../../resources/icon.png');
  const trayIcon = nativeImage.createFromPath(trayIconPath).resize({ width: 16, height: 16 });
  tray = new Tray(trayIcon);
  tray.setToolTip('DeepSeek Code');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show',
      click: () => {
        mainWindow?.show();
        mainWindow?.focus();
      },
    },
    {
      label: 'Quit',
      click: () => {
        (app as any).__quitting = true;
        saveWindowBounds();
        tray?.destroy();
        tray = null;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
  tray.on('double-click', () => {
    mainWindow?.show();
    mainWindow?.focus();
  });
}

async function ensureDefaultTemplates(): Promise<void> {
  const { promises: fs } = require('fs');
  const { join } = require('path');
  const { homedir } = require('os');
  const base = join(homedir(), '.deepseekcode');

  // AGENT.md
  const agentMd = join(base, 'AGENT.md');
  try { await fs.access(agentMd); } catch {
    await fs.mkdir(base, { recursive: true });
    await fs.writeFile(agentMd, `# DeepSeek Code — 用户指令

这是你的全局 AGENT.md 文件。在这里定义你的偏好、规则和工作风格，
Agent 每次对话都会自动加载这些指令。

## 基本设置

- 工作语言：中文
- 代码风格：简洁，不加多余的注释和文档
- 回答风格：直接切中要点

## 自定义指令

<!-- 在下方添加你的自定义指令 -->

`, 'utf8');
  }

  // Memory index
  const memDir = join(base, 'memory');
  const memIdx = join(memDir, 'MEMORY.md');
  try { await fs.access(memIdx); } catch {
    await fs.mkdir(memDir, { recursive: true });
    await fs.writeFile(memIdx, `# MEMORY

记忆索引文件。Agent 可以在这里读写长期记忆。

## 格式

每条记忆一个独立的 .md 文件，MEMORY.md 只做索引：

- [示例记忆](example.md) — 这是一个示例记忆条目

`, 'utf8');
  }

  // Skills README
  const skillsDir = join(base, 'skills');
  const skillsReadme = join(skillsDir, 'README.md');
  try { await fs.access(skillsReadme); } catch {
    await fs.mkdir(skillsDir, { recursive: true });
    await fs.writeFile(skillsReadme, `# 自定义技能

在这里添加你自己的技能（Skill）。

## 格式

每个技能是一个子目录，目录名即为技能名，目录内包含一个 SKILL.md 文件：

\`\`\`
~/.deepseekcode/skills/
  my-skill/
    SKILL.md
\`\`\`

## 技能模板

\`\`\`markdown
---
name: my-skill
description: 一句话描述这个技能做什么。TRIGGER when: 触发条件。SKIP: 不适用的情况。
version: 0.1.0
---

# 技能名称

详细说明和操作流程...
\`\`\`

## 参考

内置技能位于应用目录下的 \`skills/\` 文件夹，可参考其写法。
`, 'utf8');
  }
}

app.whenReady().then(async () => {
  await loadConfig();
  await ensureDefaultTemplates();
  await loadSkills(getConfig().agent.workspaceRoot);
  setupIpcHandlers(createProvider, getOrCreateTools);
  const { initAgentMd, initSkills } = require('./ipc-handlers');
  await initAgentMd();
  await initSkills();
  createWindow();
  createTray();
  setupAutoUpdater();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    } else {
      mainWindow?.show();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  (app as any).__quitting = true;
});
