import { app, BrowserWindow, screen } from 'electron';
import path from 'path';
import { setupIpcHandlers } from './ipc-handlers';
import { createOpenAIProvider } from './providers/openai-compatible';
import { createAnthropicProvider } from './providers/anthropic';
import { createToolRegistry } from './tools/registry';
import type { Provider } from './agent/runtime';
import type { ToolRegistry } from './agent/runtime';

let mainWindow: BrowserWindow | null = null;

const config = {
  deepseek: {
    baseUrl: 'https://api.deepseek.com/v1',
    apiKey: 'sk-fe2779230ca44d54ae075fc8d7eb9e36',
    models: ['deepseek-v4-pro', 'deepseek-v4-flash'],
  },
  anthropic: {
    apiKey: '', // Set via settings UI
    models: ['claude-sonnet-4-6', 'claude-haiku-4-5'],
  },
  agent: {
    maxTurns: 8,
    workspaceRoot: process.cwd(),
  },
  systemPrompt:
    'You are a helpful coding assistant. Use tools when needed. Be concise and factual.',
};

let toolRegistry: ToolRegistry | null = null;

function getOrCreateProvider(): Provider {
  const { getConfig } = require('./ipc-handlers');
  const cfg = getConfig();

  // Route to correct provider based on model prefix
  const model = cfg.model;
  if (model.startsWith('claude-')) {
    return createAnthropicProvider({
      apiKey: config.anthropic.apiKey || process.env.ANTHROPIC_API_KEY || '',
      model: model,
    });
  }

  return createOpenAIProvider({
    baseUrl: config.deepseek.baseUrl,
    apiKey: config.deepseek.apiKey,
    model: model,
  });
}

function getOrCreateTools(): ToolRegistry {
  if (!toolRegistry) {
    toolRegistry = createToolRegistry(config.agent.workspaceRoot);
  }
  return toolRegistry;
}

function createWindow(): void {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  mainWindow = new BrowserWindow({
    width: Math.min(1400, Math.floor(width * 0.85)),
    height: Math.min(900, Math.floor(height * 0.85)),
    minWidth: 900,
    minHeight: 600,
    title: 'DeepSeek Code',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  // In dev, load from Vite dev server; in prod, load built files
  const isDev = !app.isPackaged;
  if (isDev) {
    mainWindow.loadURL('http://localhost:5175');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  setupIpcHandlers(
    getOrCreateProvider,
    getOrCreateTools,
  );
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
