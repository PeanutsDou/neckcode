import { app, BrowserWindow, screen, Tray, Menu, nativeImage, ipcMain } from 'electron';
import path from 'path';
import { autoUpdater } from 'electron-updater';
import { setupIpcHandlers } from './ipc-handlers';
import { createOpenAIProvider } from './providers/openai-compatible';
import { createAnthropicProvider } from './providers/anthropic';
import { createToolRegistry } from './tools/registry';
import { loadConfig, saveConfig, getConfig, getActiveProvider, getModelConfig } from './config';
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
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-available', (info) => {
    mainWindow?.webContents.send('update:available', info.version);
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

function createProvider(): Provider {
  const cfg = getConfig();
  const active = getActiveProvider();
  const model = cfg.activeModel;

  const modelCfg = getModelConfig(model);
  const maxTokens = modelCfg?.maxTokens || cfg.agent.maxTokens;

  if (active.id === 'anthropic') {
    return createAnthropicProvider({
      apiKey: active.apiKey || process.env.ANTHROPIC_API_KEY || '',
      model,
      maxTokens,
    });
  }

  return createOpenAIProvider({
    baseUrl: active.baseUrl,
    apiKey: active.apiKey,
    model,
    maxTokens,
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

  const isDev = !app.isPackaged;
  if (isDev) {
    mainWindow.loadURL('http://localhost:5175');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('resize', scheduleSaveWindowBounds);
  mainWindow.on('move', scheduleSaveWindowBounds);

  mainWindow.on('close', (event) => {
    if (tray && !(app as any).__quitting) {
      event.preventDefault();
      mainWindow?.hide();
      return;
    }
    saveWindowBounds();
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

app.whenReady().then(async () => {
  await loadConfig();
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
