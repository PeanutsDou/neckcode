import { app, BrowserWindow, screen, Tray, Menu, nativeImage } from 'electron';
import path from 'path';
import { setupIpcHandlers } from './ipc-handlers';
import { createOpenAIProvider } from './providers/openai-compatible';
import { createAnthropicProvider } from './providers/anthropic';
import { createToolRegistry } from './tools/registry';
import { loadConfig, saveConfig, getConfig, getActiveProvider } from './config';
import { loadSkills } from './skills/loader';
import type { Provider } from './agent/runtime';
import type { ToolRegistry } from './agent/runtime';

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
const toolRegistries = new Map<string, ToolRegistry>();
let saveBoundsTimer: ReturnType<typeof setTimeout> | null = null;

function createProvider(): Provider {
  const cfg = getConfig();
  const active = getActiveProvider();
  const model = cfg.activeModel;

  if (active.id === 'anthropic') {
    return createAnthropicProvider({
      apiKey: active.apiKey || process.env.ANTHROPIC_API_KEY || '',
      model,
      maxTokens: cfg.agent.maxTokens,
    });
  }

  return createOpenAIProvider({
    baseUrl: active.baseUrl,
    apiKey: active.apiKey,
    model,
    maxTokens: cfg.agent.maxTokens,
  });
}

function getOrCreateTools(sessionId = 'default'): ToolRegistry {
  let registry = toolRegistries.get(sessionId);
  if (!registry) {
    const { BrowserWindow } = require('electron');
    const { getPermissionMode, pendingConfirms } = require('./ipc-handlers');
    registry = createToolRegistry(
      getConfig().agent.workspaceRoot,
      async (message: string) => {
        if (!mainWindow) return false;
        return new Promise((resolve, reject) => {
          const win = BrowserWindow.getAllWindows()[0];
          if (!win) { reject(new Error('No window')); return; }
          const confirmId = `confirm_${Date.now()}_${Math.random().toString(36).slice(2)}`;
          pendingConfirms.set(confirmId, { sessionId, resolve, reject });
          win.webContents.send('confirm:show', sessionId, confirmId, message);
        });
      },
      async (questions) => {
        return new Promise((resolve, reject) => {
          // We need access to the IPC ask mechanism. Use a global approach.
          const win = BrowserWindow.getAllWindows()[0];
          if (!win) { reject(new Error('No window')); return; }
          // Send questions to renderer and wait for response
          const askId = `ask_${Date.now()}_${Math.random().toString(36).slice(2)}`;
          // Register the pending promise via a module-level store
          const { pendingAsks } = require('./ipc-handlers');
          pendingAsks.set(askId, { sessionId, resolve, reject });
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

  // Persist bounds after resizing/moving settles. Writing config on every native
  // resize frame can make Windows compositor repaint behind the renderer.
  mainWindow.on('resize', scheduleSaveWindowBounds);
  mainWindow.on('move', scheduleSaveWindowBounds);

  // Minimize to tray instead of closing
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
