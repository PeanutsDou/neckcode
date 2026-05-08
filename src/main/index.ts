import { app, BrowserWindow, screen, Tray, Menu, nativeImage } from 'electron';
import path from 'path';
import { setupIpcHandlers } from './ipc-handlers';
import { createOpenAIProvider } from './providers/openai-compatible';
import { createAnthropicProvider } from './providers/anthropic';
import { createToolRegistry } from './tools/registry';
import { loadConfig, saveConfig, getConfig } from './config';
import type { Provider } from './agent/runtime';
import type { ToolRegistry } from './agent/runtime';

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let toolRegistry: ToolRegistry | null = null;

function createProvider(): Provider {
  const cfg = getConfig();
  const model = cfg.activeModel;

  if (model.startsWith('claude-')) {
    return createAnthropicProvider({
      apiKey: cfg.anthropic.apiKey || process.env.ANTHROPIC_API_KEY || '',
      model,
    });
  }

  return createOpenAIProvider({
    baseUrl: cfg.deepseek.baseUrl,
    apiKey: cfg.deepseek.apiKey,
    model,
  });
}

function getOrCreateTools(): ToolRegistry {
  if (!toolRegistry) {
    const { dialog } = require('electron');
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

  mainWindow = new BrowserWindow({
    x: saved?.x,
    y: saved?.y,
    width: saved?.width || Math.min(1400, Math.floor(sw * 0.85)),
    height: saved?.height || Math.min(900, Math.floor(sh * 0.85)),
    minWidth: 900,
    minHeight: 600,
    title: 'DeepSeek Code',
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
    mainWindow.webContents.openDevTools();
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
  // Create a simple 16x16 colored icon (blue square)
  const size = 16;
  const buf = Buffer.alloc(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    const off = i * 4;
    buf[off] = 137;    // R
    buf[off + 1] = 180; // G
    buf[off + 2] = 250; // B
    buf[off + 3] = 255; // A
  }
  const icon = nativeImage.createFromBuffer(buf, { width: size, height: size });
  tray = new Tray(icon);
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
  setupIpcHandlers(createProvider, getOrCreateTools);
  const { initClaudeMd } = require('./ipc-handlers');
  await initClaudeMd();
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
