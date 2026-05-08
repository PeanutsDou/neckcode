import { ipcMain, BrowserWindow } from 'electron';
import { promises as fs } from 'fs';
import { dirname, resolve, join } from 'path';
import { AgentRuntime, type Provider } from './agent/runtime';
import type { ToolRegistry } from './agent/runtime';

let agent: AgentRuntime | null = null;
let currentAbortController: AbortController | null = null;
let persistentSession: AgentRuntime | null = null;

// In-memory config (updated by IPC)
const appConfig = {
  provider: 'deepseek',
  model: 'deepseek-v4-pro',
  models: ['deepseek-v4-pro', 'deepseek-v4-flash', 'claude-sonnet-4-6', 'claude-haiku-4-5'],
  workspaceRoot: process.cwd(),
  systemPrompt: 'You are a helpful coding assistant. Use tools when needed. Be concise and factual.',
  maxTurns: 8,
};

// In-memory providers store
const providers: Map<string, { id: string; name: string; type: string; baseUrl: string; apiKey: string; model: string; models: string[] }> = new Map();

// Session storage: JSON files in .sessions/ directory
function sessionsDir(): string {
  return join(appConfig.workspaceRoot, '.sessions');
}

async function ensureSessionsDir(): Promise<void> {
  await fs.mkdir(sessionsDir(), { recursive: true });
}

interface SessionData {
  id: string;
  title: string;
  projectPath: string;
  modelId: string;
  messages: unknown[];
  createdAt: number;
  updatedAt: number;
}

function getWindow() {
  return BrowserWindow.getAllWindows()[0];
}

function ensurePath(workspaceRoot: string, inputPath: string): string {
  const p = inputPath.trim() || '.';
  const resolved = resolve(workspaceRoot, p);
  const normalizedRoot = resolve(workspaceRoot);
  if (resolved !== normalizedRoot && !resolved.startsWith(normalizedRoot + '\\') && !resolved.startsWith(normalizedRoot + '/')) {
    throw new Error(`Path escapes workspace root: ${p}`);
  }
  return resolved;
}

export function setupIpcHandlers(
  getProvider: () => Provider,
  getTools: () => ToolRegistry,
) {
  // ---- Agent ----
  ipcMain.handle('agent:send-message', async (_event, message: string) => {
    const p = getProvider();
    if (!p) throw new Error('No provider configured');

    if (currentAbortController) {
      currentAbortController.abort();
    }
    currentAbortController = new AbortController();

    // Reuse persistent session to keep context across turns
    if (!persistentSession) {
      persistentSession = new AgentRuntime(
        p,
        getTools(),
        appConfig.maxTurns,
        appConfig.systemPrompt,
      );
    }
    agent = persistentSession;

    try {
      const result = await persistentSession.runUserTurn(
        message,
        {
          onDelta(text) {
            getWindow()?.webContents.send('agent:delta', text);
          },
          onToolStart(toolCall) {
            getWindow()?.webContents.send('agent:tool-start', toolCall);
          },
          onToolResult(toolCall, result) {
            getWindow()?.webContents.send('agent:tool-result', {
              name: toolCall.name,
              argumentsText: toolCall.argumentsText,
              result,
            });
          },
          onComplete(step) {
            getWindow()?.webContents.send('agent:turn-done', step);
          },
          onError(error) {
            getWindow()?.webContents.send('agent:error', error.message);
          },
        },
        currentAbortController.signal,
      );
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg !== 'Aborted') {
        getWindow()?.webContents.send('agent:error', msg);
      }
      return null;
    }
  });

  ipcMain.handle('agent:abort', () => {
    currentAbortController?.abort();
    currentAbortController = null;
  });

  // ---- File system (direct) ----
  ipcMain.handle('fs:list-dir', async (_event, dirPath: string) => {
    const p = ensurePath(appConfig.workspaceRoot, dirPath);
    const entries = await fs.readdir(p, { withFileTypes: true });
    return entries
      .sort((a, b) => {
        if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
        return a.name.localeCompare(b.name);
      })
      .map(e => ({
        name: e.name,
        path: join(dirPath || '.', e.name).replace(/\\/g, '/'),
        isDir: e.isDirectory(),
      }));
  });

  ipcMain.handle('fs:read-file', async (_event, filePath: string) => {
    const p = ensurePath(appConfig.workspaceRoot, filePath);
    return await fs.readFile(p, 'utf8');
  });

  ipcMain.handle('fs:write-file', async (_event, filePath: string, content: string) => {
    const p = ensurePath(appConfig.workspaceRoot, filePath);
    await fs.mkdir(dirname(p), { recursive: true });
    await fs.writeFile(p, content, 'utf8');
  });

  // ---- Config ----
  ipcMain.handle('config:get', () => ({
    provider: appConfig.provider,
    model: appConfig.model,
    models: appConfig.models,
    workspaceRoot: appConfig.workspaceRoot,
    maxTurns: appConfig.maxTurns,
  }));

  ipcMain.handle('config:set', (_event, key: string, value: unknown) => {
    (appConfig as Record<string, unknown>)[key] = value;
    // Reset session when model changes so new model takes effect
    if (key === 'model') {
      persistentSession = null;
      getWindow()?.webContents.send('agent:delta', ''); // trigger re-render
    }
  });

  ipcMain.handle('config:get-providers', () => {
    return Array.from(providers.values());
  });

  ipcMain.handle('config:set-provider', (_event, id: string, config: unknown) => {
    providers.set(id, config as { id: string; name: string; type: string; baseUrl: string; apiKey: string; model: string; models: string[] });
  });

  // ---- Session persistence (file-based) ----
  ipcMain.handle('session:save', async (_event, session: SessionData) => {
    await ensureSessionsDir();
    const filePath = join(sessionsDir(), `${session.id}.json`);
    await fs.writeFile(filePath, JSON.stringify(session, null, 2), 'utf8');
  });

  ipcMain.handle('session:load', async (_event, id: string) => {
    try {
      const filePath = join(sessionsDir(), `${id}.json`);
      const content = await fs.readFile(filePath, 'utf8');
      return JSON.parse(content) as SessionData;
    } catch {
      return null;
    }
  });

  ipcMain.handle('session:list', async () => {
    await ensureSessionsDir();
    const entries = await fs.readdir(sessionsDir());
    const sessions: SessionData[] = [];
    for (const entry of entries) {
      if (!entry.endsWith('.json')) continue;
      try {
        const content = await fs.readFile(join(sessionsDir(), entry), 'utf8');
        sessions.push(JSON.parse(content) as SessionData);
      } catch {
        // Skip corrupted files
      }
    }
    return sessions.sort((a, b) => b.updatedAt - a.updatedAt);
  });

  ipcMain.handle('session:delete', async (_event, id: string) => {
    try {
      await fs.unlink(join(sessionsDir(), `${id}.json`));
    } catch {
      // File doesn't exist, ignore
    }
  });
}

// Re-export for main/index.ts config access
export function getConfig() {
  return appConfig;
}

export function setConfigModel(model: string) {
  appConfig.model = model;
}
