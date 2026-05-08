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
let toolRegistry: ToolRegistry | null = null;

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

function getOrCreateTools(): ToolRegistry {
  if (!toolRegistry) {
    const { dialog, BrowserWindow } = require('electron');
    const { getPermissionMode } = require('./ipc-handlers');
    toolRegistry = createToolRegistry(
      getConfig().agent.workspaceRoot,
      async (message: string) => {
        if (!mainWindow) return false;
        const result = await dialog.showMessageBox(mainWindow, {
          type: 'warning',
          title: 'Confirm',
          message,
          buttons: ['Cancel', 'Proceed'],
          defaultId: 0,
          cancelId: 0,
        });
        return result.response === 1;
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
          pendingAsks.set(askId, { resolve, reject });
          win.webContents.send('ask:show', askId, questions);
        });
      },
      () => getPermissionMode(),
    );
  }
  return toolRegistry;
}

function saveWindowBounds(): void {
  if (!mainWindow) return;
  const bounds = mainWindow.getBounds();
  const cfg = getConfig();
  cfg.window = { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
  saveConfig().catch(() => {});
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

  // Save window bounds on move/resize
  mainWindow.on('resize', () => saveWindowBounds());
  mainWindow.on('move', () => saveWindowBounds());

  // Minimize to tray instead of closing
  mainWindow.on('close', (event) => {
    if (tray && !(app as any).__quitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });

  mainWindow.on('closed', () => {
    saveWindowBounds();
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
