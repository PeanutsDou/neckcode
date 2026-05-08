import { ipcMain, BrowserWindow } from 'electron';
import { promises as fs } from 'fs';
import { dirname, resolve, join } from 'path';
import { spawn, type ChildProcess } from 'child_process';
import { AgentRuntime, type Provider } from './agent/runtime';
import type { ToolRegistry } from './agent/runtime';
import { getConfig, setConfig, saveConfig } from './config';
import type { AppConfigData } from './config';
import { discoverClaudeMd } from './claude-md';

let claudeMdContent = '';

let agent: AgentRuntime | null = null;
let currentAbortController: AbortController | null = null;
let persistentSession: AgentRuntime | null = null;

// Session storage: JSON files in .sessions/ directory
function sessionsDir(): string {
  return join(getConfig().agent.workspaceRoot, '.sessions');
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
  ipcMain.handle('agent:send-message', async (_event, message: string, attachments: { type: string; data: string; mimeType: string }[]) => {
    const p = getProvider();
    if (!p) throw new Error('No provider configured');

    if (currentAbortController) {
      currentAbortController.abort();
    }
    currentAbortController = new AbortController();

    // Reuse persistent session to keep context across turns
    if (!persistentSession) {
      const cfg = getConfig();
      const fullPrompt = claudeMdContent
        ? `${cfg.systemPrompt}\n\n${claudeMdContent}`
        : cfg.systemPrompt;
      persistentSession = new AgentRuntime(
        p,
        getTools(),
        cfg.agent.maxTurns,
        fullPrompt,
      );
    }
    agent = persistentSession;

    try {
      const result = await persistentSession.runUserTurn(
        message,
        (attachments || []) as { type: 'image'; data: string; mimeType: string }[],
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

  ipcMain.handle('agent:compare', async (_event, message: string, models: string[]) => {
    const { createAnthropicProvider } = require('./providers/anthropic');
    const { createOpenAIProvider } = require('./providers/openai-compatible');
    const results: { model: string; text: string; error?: string }[] = [];

    for (const model of models) {
      try {
        const cfg = getConfig();
        const p: Provider = model.startsWith('claude-')
          ? createAnthropicProvider({ apiKey: cfg.anthropic.apiKey || process.env.ANTHROPIC_API_KEY || '', model })
          : createOpenAIProvider({ baseUrl: cfg.deepseek.baseUrl, apiKey: cfg.deepseek.apiKey, model });

        const tempSession = new AgentRuntime(p, getTools(), 1, cfg.systemPrompt);
        const result = await tempSession.runUserTurn(message, [], { onComplete() {}, onError() {} });
        results.push({ model, text: result.text });
      } catch (err) {
        results.push({ model, text: '', error: err instanceof Error ? err.message : String(err) });
      }
    }
    return results;
  });

  ipcMain.handle('agent:abort', () => {
    currentAbortController?.abort();
    currentAbortController = null;
  });

  // ---- File system (direct) ----
  ipcMain.handle('fs:list-dir', async (_event, dirPath: string) => {
    const p = ensurePath(getConfig().agent.workspaceRoot, dirPath);
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
    const p = ensurePath(getConfig().agent.workspaceRoot, filePath);
    return await fs.readFile(p, 'utf8');
  });

  ipcMain.handle('fs:write-file', async (_event, filePath: string, content: string) => {
    const p = ensurePath(getConfig().agent.workspaceRoot, filePath);
    await fs.mkdir(dirname(p), { recursive: true });
    await fs.writeFile(p, content, 'utf8');
  });

  // ---- Config ----
  ipcMain.handle('config:get', () => {
    const cfg = getConfig();
    return {
      model: cfg.activeModel,
      models: [...cfg.deepseek.models, ...cfg.anthropic.models],
      workspaceRoot: cfg.agent.workspaceRoot,
      maxTurns: cfg.agent.maxTurns,
      baseUrl: cfg.deepseek.baseUrl,
      hasApiKey: !!cfg.deepseek.apiKey,
      hasAnthropicKey: !!cfg.anthropic.apiKey,
    };
  });

  ipcMain.handle('config:set', async (_event, key: string, value: unknown) => {
    const cfg = getConfig();
    if (key === 'model') cfg.activeModel = value as string;
    else if (key === 'maxTurns') cfg.agent.maxTurns = value as number;
    else if (key === 'systemPrompt') cfg.systemPrompt = value as string;
    else if (key === 'deepseekApiKey') cfg.deepseek.apiKey = value as string;
    else if (key === 'anthropicApiKey') cfg.anthropic.apiKey = value as string;
    else if (key === 'baseUrl') cfg.deepseek.baseUrl = value as string;
    await saveConfig();
    if (key === 'model') {
      persistentSession = null;
      getWindow()?.webContents.send('agent:delta', '');
    }
  });

  ipcMain.handle('config:get-full', () => getConfig());

  ipcMain.handle('config:get-providers', () => {
    const cfg = getConfig();
    return [
      { id: 'deepseek', name: 'DeepSeek', type: 'openai-compatible', models: cfg.deepseek.models },
      { id: 'anthropic', name: 'Anthropic', type: 'anthropic', models: cfg.anthropic.models },
    ];
  });

  ipcMain.handle('config:set-provider', async (_event, id: string, pc: unknown) => {
    const p = pc as { apiKey?: string; baseUrl?: string; models?: string[] };
    const cfg = getConfig();
    if (id === 'deepseek') {
      if (p.apiKey !== undefined) cfg.deepseek.apiKey = p.apiKey;
      if (p.baseUrl !== undefined) cfg.deepseek.baseUrl = p.baseUrl;
      if (p.models !== undefined) cfg.deepseek.models = p.models;
    } else if (id === 'anthropic') {
      if (p.apiKey !== undefined) cfg.anthropic.apiKey = p.apiKey;
      if (p.models !== undefined) cfg.anthropic.models = p.models;
    }
    await saveConfig();
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

  // ---- CLAUDE.md ----
  ipcMain.handle('claude-md:reload', async () => {
    const result = await discoverClaudeMd(getConfig().agent.workspaceRoot);
    claudeMdContent = result.content;
    persistentSession = null;
    return result.files;
  });

  ipcMain.handle('claude-md:get', () => {
    return { content: claudeMdContent };
  });

  // ---- Terminal ----
  let termProcess: ChildProcess | null = null;

  ipcMain.handle('terminal:start', () => {
    if (termProcess) return true;

    const shell = process.platform === 'win32' ? 'powershell.exe' : 'bash';
    termProcess = spawn(shell, [], {
      cwd: getConfig().agent.workspaceRoot,
      env: process.env,
    });

    termProcess.stdout?.on('data', (data: Buffer) => {
      getWindow()?.webContents.send('terminal:data', data.toString());
    });

    termProcess.stderr?.on('data', (data: Buffer) => {
      getWindow()?.webContents.send('terminal:data', data.toString());
    });

    termProcess.on('exit', () => {
      getWindow()?.webContents.send('terminal:data', '\r\n[Process exited]');
      termProcess = null;
    });

    return true;
  });

  ipcMain.handle('terminal:write', (_event, text: string) => {
    if (termProcess?.stdin?.writable) {
      termProcess.stdin.write(text);
    }
  });

  ipcMain.handle('terminal:stop', () => {
    termProcess?.kill();
    termProcess = null;
  });
}

export async function initClaudeMd(): Promise<void> {
  const result = await discoverClaudeMd(getConfig().agent.workspaceRoot);
  claudeMdContent = result.content;
}

// Re-export for main/index.ts
export { getConfig, setConfig, saveConfig } from './config';
