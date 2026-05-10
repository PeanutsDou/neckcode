import { ipcMain, BrowserWindow } from 'electron';
import { promises as fs } from 'fs';
import { dirname, resolve, join } from 'path';
import { homedir } from 'os';
import { spawn, type ChildProcess } from 'child_process';
import { AgentRuntime, type Provider } from './agent/runtime';
import type { ToolRegistry } from './agent/runtime';
import type { Message } from './agent/types';
import { getConfig, setConfig, saveConfig, getActiveProvider } from './config';
import type { AppConfigData, ProviderConfig } from './config';
import type { PermissionMode } from '../shared/permissions';
import { discoverAgentMd } from './agent-md';
import { getLoadedSkills, loadSkills } from './skills/loader';
interface SessionData {
  id: string;
  title?: string;
  projectPath?: string;
  modelId?: string;
  messages?: unknown[];
  createdAt?: number;
  updatedAt?: number;
}

let agentMdContent = '';
let agentMdFiles: string[] = [];

// Pending UI promises, keyed by unique IDs and tied to the originating session.
export const pendingAsks = new Map<string, { sessionId: string; resolve: (answers: Record<string, string>) => void; reject: (err: Error) => void }>();
export const pendingConfirms = new Map<string, { sessionId: string; resolve: (approved: boolean) => void; reject: (err: Error) => void }>();

const sessionAgents = new Map<string, AgentRuntime>();
const sessionAbortControllers = new Map<string, AbortController>();

let currentPermissionMode: PermissionMode = getConfig().permissionMode || 'default';

export function getPermissionMode(): PermissionMode {
  currentPermissionMode = getConfig().permissionMode || currentPermissionMode || 'default';
  return currentPermissionMode;
}

function sessionsDir(): string {
  return join(homedir(), '.deepseekcode', 'sessions');
}

async function ensureSessionsDir(): Promise<void> {
  await fs.mkdir(sessionsDir(), { recursive: true });
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
  getTools: (sessionId?: string) => ToolRegistry,
) {
  function createSessionAgent(sessionId: string, messages?: Message[]): AgentRuntime {
    const cfg = getConfig();
    const fullPrompt = agentMdContent
      ? `${cfg.systemPrompt}\n\n${agentMdContent}`
      : cfg.systemPrompt;
    const agent = new AgentRuntime(getProvider(), getTools(sessionId), cfg.agent.maxTurns, fullPrompt);
    if (messages?.length) agent.loadMessages(messages);
    return agent;
  }

  function cancelPendingInteractionsForSession(sessionId: string, reason: string): void {
    for (const [askId, pending] of pendingAsks) {
      if (pending.sessionId === sessionId) {
        pendingAsks.delete(askId);
        pending.reject(new Error(reason));
      }
    }
    for (const [confirmId, pending] of pendingConfirms) {
      if (pending.sessionId === sessionId) {
        pendingConfirms.delete(confirmId);
        pending.resolve(false);
      }
    }
  }

  // ---- Agent ----

  async function runAgentTurnWithStreaming(
    sessionId: string,
    sessionAgent: AgentRuntime,
    message: string,
    attachments: { type: string; data: string; mimeType: string }[],
    abortCtrl: AbortController,
  ) {
    let deltaBuffer = '';
    let flushTimer: ReturnType<typeof setInterval> | null = null;
    const flushDelta = () => {
      if (deltaBuffer) {
        getWindow()?.webContents.send('agent:delta', sessionId, deltaBuffer);
        deltaBuffer = '';
      }
    };

    try {
      const result = await sessionAgent.runUserTurn(
        message,
        attachments as { type: 'image'; data: string; mimeType: string }[],
        {
          onDelta(text) {
            if (!flushTimer) flushTimer = setInterval(flushDelta, 30);
            deltaBuffer += text;
          },
          onReasoning(text) {
            getWindow()?.webContents.send('agent:thinking-delta', sessionId, text);
          },
          onToolStart(toolCall) {
            getWindow()?.webContents.send('agent:tool-start', sessionId, toolCall);
          },
          onToolResult(toolCall, result) {
            getWindow()?.webContents.send('agent:tool-result', sessionId, {
              name: toolCall.name,
              argumentsText: toolCall.argumentsText,
              result,
            });
          },
          onComplete(step) {
            flushDelta();
            getWindow()?.webContents.send('agent:turn-done', sessionId, step);
          },
          onError(error) {
            getWindow()?.webContents.send('agent:error', sessionId, error.message);
          },
        },
        abortCtrl.signal,
      );
      if (flushTimer) { clearInterval(flushTimer); flushDelta(); }
      return result;
    } catch (err) {
      if (flushTimer) { clearInterval(flushTimer); flushDelta(); }
      const msg = err instanceof Error ? err.message : String(err);
      if (msg !== 'Aborted') {
        getWindow()?.webContents.send('agent:error', sessionId, msg);
      }
      return null;
    }
  }

  function getOrCreateSessionAgent(sessionId: string): AgentRuntime {
    let sessionAgent = sessionAgents.get(sessionId);
    if (!sessionAgent) {
      const cfg = getConfig();
      const fullPrompt = agentMdContent
        ? `${cfg.systemPrompt}\n\n${agentMdContent}`
        : cfg.systemPrompt;
      sessionAgent = new AgentRuntime(getProvider(), getTools(sessionId), cfg.agent.maxTurns, fullPrompt);
      sessionAgents.set(sessionId, sessionAgent);
    }
    return sessionAgent;
  }

  function abortPreviousRun(sessionId: string): AbortController {
    const prevAbort = sessionAbortControllers.get(sessionId);
    if (prevAbort) prevAbort.abort();
    const abortCtrl = new AbortController();
    sessionAbortControllers.set(sessionId, abortCtrl);
    return abortCtrl;
  }

  ipcMain.handle('agent:send-message', async (_event, sessionId: string, message: string, attachments: { type: string; data: string; mimeType: string }[]) => {
    const p = getProvider();
    if (!p) throw new Error('No provider configured');
    const abortCtrl = abortPreviousRun(sessionId);
    const sessionAgent = getOrCreateSessionAgent(sessionId);
    return runAgentTurnWithStreaming(sessionId, sessionAgent, message, attachments || [], abortCtrl);
  });

  ipcMain.handle('agent:regenerate', async (_event, sessionId: string, message: string, attachments: { type: string; data: string; mimeType: string }[]) => {
    const p = getProvider();
    if (!p) throw new Error('No provider configured');
    const abortCtrl = abortPreviousRun(sessionId);
    const sessionAgent = getOrCreateSessionAgent(sessionId);
    sessionAgent.removeLastUserTurn();
    return runAgentTurnWithStreaming(sessionId, sessionAgent, message, attachments || [], abortCtrl);
  });

  ipcMain.handle('agent:abort', (_event, sessionId: string) => {
    sessionAbortControllers.get(sessionId)?.abort();
    sessionAbortControllers.delete(sessionId);
    cancelPendingInteractionsForSession(sessionId, 'Session aborted');
  });

  ipcMain.handle('agent:reset', (_event, sessionId: string) => {
    sessionAgents.delete(sessionId);
    sessionAbortControllers.delete(sessionId);
    cancelPendingInteractionsForSession(sessionId, 'Session reset');
  });

  ipcMain.handle('agent:set-context', async (_event, sessionId: string, messages: Array<{ role: string; content: string }>) => {
    const p = getProvider();
    if (!p) throw new Error('No provider configured');
    const cfg = getConfig();
    const fullPrompt = agentMdContent
      ? `${cfg.systemPrompt}\n\n${agentMdContent}`
      : cfg.systemPrompt;
    const agent = new AgentRuntime(p, getTools(sessionId), cfg.agent.maxTurns, fullPrompt);
    agent.loadMessages(messages as any);
    sessionAgents.set(sessionId, agent);
  });

  // Ask-user-question round-trip
  ipcMain.handle('ask:respond', (_event, askId: string, answers: Record<string, string> | null) => {
    const pending = pendingAsks.get(askId);
    if (pending) {
      pendingAsks.delete(askId);
      if (answers) {
        pending.resolve(answers);
      } else {
        pending.reject(new Error('User cancelled'));
      }
    }
  });

  ipcMain.handle('confirm:respond', (_event, confirmId: string, approved: boolean) => {
    const pending = pendingConfirms.get(confirmId);
    if (pending) {
      pendingConfirms.delete(confirmId);
      pending.resolve(Boolean(approved));
    }
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
    const active = getActiveProvider();
    const allModels = cfg.providers.flatMap(p => p.models);
    return {
      model: cfg.activeModel,
      models: allModels,
      providers: cfg.providers.map(p => ({ id: p.id, name: p.name, baseUrl: p.baseUrl, apiKey: p.apiKey, models: p.models })),
      activeProvider: cfg.activeProvider,
      workspaceRoot: cfg.agent.workspaceRoot,
      maxTurns: cfg.agent.maxTurns,
      maxTokens: cfg.agent.maxTokens,
      contextLimit: cfg.agent.contextLimit,
      permissionMode: cfg.permissionMode,
      fontScale: cfg.fontScale || 100,
      baseUrl: active.baseUrl,
      deepseekApiKey: cfg.providers.find(p => p.id === 'deepseek')?.apiKey || '',
      anthropicApiKey: cfg.providers.find(p => p.id === 'anthropic')?.apiKey || '',
    };
  });

  ipcMain.handle('config:set', async (_event, key: string, value: unknown) => {
    const cfg = getConfig();
    if (key === 'model') {
      cfg.activeModel = value as string;
      // Auto-set activeProvider based on which provider has this model
      for (const p of cfg.providers) {
        if (p.models.includes(cfg.activeModel)) {
          cfg.activeProvider = p.id;
          break;
        }
      }
    }
    else if (key === 'activeProvider') cfg.activeProvider = value as string;
    else if (key === 'maxTurns') cfg.agent.maxTurns = value as number;
    else if (key === 'maxTokens') cfg.agent.maxTokens = value as number;
    else if (key === 'contextLimit') cfg.agent.contextLimit = value as number;
    else if (key === 'systemPrompt') cfg.systemPrompt = value as string;
    else if (key === 'fontScale') { cfg.fontScale = value as number; await saveConfig(); return; }
    else if (key === 'deepseekApiKey') {
      const ds = cfg.providers.find(p => p.id === 'deepseek');
      if (ds) ds.apiKey = value as string;
    }
    else if (key === 'anthropicApiKey') {
      const ant = cfg.providers.find(p => p.id === 'anthropic');
      if (ant) ant.apiKey = value as string;
    }
    else if (key === 'baseUrl') {
      const active = getActiveProvider();
      active.baseUrl = value as string;
    }
    await saveConfig();
    if (key === 'model' || key === 'activeProvider') {
      sessionAgents.clear();
    }
  });

  ipcMain.handle('config:get-full', () => getConfig());

  ipcMain.handle('config:get-providers', () => {
    return getConfig().providers.map(p => ({ id: p.id, name: p.name, models: p.models }));
  });

  ipcMain.handle('config:set-provider', async (_event, pc: ProviderConfig) => {
    const cfg = getConfig();
    const idx = cfg.providers.findIndex(p => p.id === pc.id);
    if (idx >= 0) {
      // Merge: don't overwrite non-empty values with empty ones
      const existing = cfg.providers[idx];
      cfg.providers[idx] = {
        ...existing,
        name: pc.name || existing.name,
        baseUrl: pc.baseUrl || existing.baseUrl,
        apiKey: pc.apiKey || existing.apiKey,
        models: pc.models.length > 0 ? pc.models : existing.models,
      };
    } else {
      cfg.providers.push(pc);
    }
    await saveConfig();
  });

  // Permission mode
  ipcMain.handle('permission:get', () => getPermissionMode());
  ipcMain.handle('permission:set', async (_event, mode: string) => {
    const valid: string[] = ['default', 'fullAccess'];
    if (valid.includes(mode)) {
      currentPermissionMode = mode as PermissionMode;
      const cfg = getConfig();
      cfg.permissionMode = currentPermissionMode;
      await saveConfig();
    }
    return currentPermissionMode;
  });

  ipcMain.handle('config:delete-provider', async (_event, id: string) => {
    const cfg = getConfig();
    cfg.providers = cfg.providers.filter(p => p.id !== id);
    if (cfg.activeProvider === id) {
      cfg.activeProvider = cfg.providers[0]?.id || 'deepseek';
    }
    await saveConfig();
  });

  // ---- Session persistence (file-based) ----
  ipcMain.handle('session:save', async (_event, session: SessionData) => {
    await ensureSessionsDir();
    const filePath = join(sessionsDir(), `${session.id}.json`);
    let existing: SessionData | null = null;
    try { const raw = await fs.readFile(filePath, 'utf8'); existing = JSON.parse(raw) as SessionData; } catch { /* */ }
    const merged = { ...existing, ...session, updatedAt: session.updatedAt || Date.now() };
    await fs.writeFile(filePath, JSON.stringify(merged, null, 2), 'utf8');
  });

  ipcMain.handle('session:load', async (_event, id: string) => {
    try {
      const content = await fs.readFile(join(sessionsDir(), `${id}.json`), 'utf8');
      return JSON.parse(content) as SessionData;
    } catch { return null; }
  });

  ipcMain.handle('session:list', async () => {
    await ensureSessionsDir();
    const entries = await fs.readdir(sessionsDir());
    const sessions: SessionData[] = [];
    for (const entry of entries) {
      if (!entry.endsWith('.json')) continue;
      try { const content = await fs.readFile(join(sessionsDir(), entry), 'utf8'); sessions.push(JSON.parse(content) as SessionData); } catch { /* */ }
    }
    return sessions.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  });

  ipcMain.handle('session:delete', async (_event, id: string) => {
    sessionAbortControllers.get(id)?.abort();
    sessionAbortControllers.delete(id);
    sessionAgents.delete(id);
    cancelPendingInteractionsForSession(id, 'Session deleted');
    try { await fs.unlink(join(sessionsDir(), `${id}.json`)); } catch { /* */ }
  });

  ipcMain.handle('session:rename', async (_event, id: string, newTitle: string) => {
    const filePath = join(sessionsDir(), `${id}.json`);
    try {
      const content = await fs.readFile(filePath, 'utf8');
      const session = JSON.parse(content) as SessionData;
      session.title = newTitle;
      session.updatedAt = Date.now();
      await fs.writeFile(filePath, JSON.stringify(session, null, 2), 'utf8');
      return true;
    } catch { return false; }
  });

  ipcMain.handle('session:generate-title', async (_event, userMessage: string) => {
    try {
      const p = getProvider();
      if (!p) return null;

      const result = await p.runStep({
        messages: [
          { role: 'system', content: 'Generate a very short title (4-6 words max) for a conversation. Reply with ONLY the title, no quotes, no explanation. Use the user\'s language.' },
          { role: 'user', content: userMessage.slice(0, 500) },
        ],
        tools: [],
        model: 'default',
      });

      const title = result.text.trim().slice(0, 80);
      return title || null;
    } catch {
      return null;
    }
  });

  // ---- CLAUDE.md ----
  ipcMain.handle('agent-md:reload', async () => {
    const result = await discoverAgentMd(getConfig().agent.workspaceRoot);
    agentMdContent = result.content;
    agentMdFiles = result.files;
    sessionAgents.clear();
    return result.files;
  });

  ipcMain.handle('agent-md:get', () => {
    return { content: agentMdContent, files: agentMdFiles };
  });

  ipcMain.handle('memory:list', async () => {
    const dirs = [
      join(getConfig().agent.workspaceRoot, '.deepseekcode', 'memory'),
      join(homedir(), '.deepseekcode', 'memory'),
    ];
    const results: Array<{ name: string; path: string }> = [];
    for (const memDir of dirs) {
      try {
        const entries = await fs.readdir(memDir, { withFileTypes: true });
        for (const e of entries) {
          if (e.isFile() && e.name.endsWith('.md')) {
            results.push({ name: e.name.replace('.md', ''), path: join(memDir, e.name) });
          }
        }
      } catch { /* dir not found */ }
    }
    return results;
  });

  ipcMain.handle('memory:read', async (_event, filePath: string) => {
    // Memory files are outside workspace — allow direct read
    return await fs.readFile(filePath, 'utf8');
  });

  ipcMain.handle('memory:delete', async (_event, filePath: string) => {
    // Prevent deleting AGENT.md
    if (filePath.toLowerCase().endsWith('agent.md')) {
      throw new Error('AGENT.md cannot be deleted');
    }
    try {
      await fs.unlink(filePath);
    } catch (err) {
      throw new Error(`Failed to delete: ${err instanceof Error ? err.message : String(err)}`);
    }
  });

  ipcMain.handle('memory:write', async (_event, filePath: string, content: string) => {
    await fs.writeFile(filePath, content, 'utf8');
  });

  // ---- Skills ----
  ipcMain.handle('skills:list', () => {
    return getLoadedSkills().map(s => ({
      name: s.name,
      description: s.description,
      whenToUse: s.whenToUse,
      argumentHint: s.argumentHint,
      userInvocable: s.userInvocable,
    }));
  });

  ipcMain.handle('skills:invoke', async (_event, skillName: string) => {
    // Reload skills to ensure freshness
    await loadSkills(getConfig().agent.workspaceRoot);
    const { skillHandlers } = require('./tools/skill-tools');
    return skillHandlers.invoke_skill({ skill: skillName });
  });

  ipcMain.handle('skills:write-content', async (_event, skillName: string, content: string) => {
    await loadSkills(getConfig().agent.workspaceRoot);
    const { getSkill } = require('./skills/loader');
    const skill = getSkill(skillName);
    if (!skill) return false;
    await fs.writeFile(join(skill.rootDir, 'SKILL.md'), content, 'utf8');
    return true;
  });

  ipcMain.handle('skills:delete', async (_event, skillName: string) => {
    await loadSkills(getConfig().agent.workspaceRoot);
    const { getSkill } = require('./skills/loader');
    const skill = getSkill(skillName);
    if (!skill) throw new Error('Skill not found');
    await fs.rm(skill.rootDir, { recursive: true });
    await loadSkills(getConfig().agent.workspaceRoot);
    return true;
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

  // ---- Window controls ----
  ipcMain.handle('window:minimize', () => getWindow()?.minimize());
  ipcMain.handle('window:maximize', () => {
    const w = getWindow();
    if (w?.isMaximized()) w.unmaximize();
    else w?.maximize();
  });
  ipcMain.handle('window:close', () => getWindow()?.close());

  ipcMain.handle('terminal:stop', () => {
    termProcess?.kill();
    termProcess = null;
  });
}

export async function initAgentMd(): Promise<void> {
  const result = await discoverAgentMd(getConfig().agent.workspaceRoot);
  agentMdContent = result.content;
  agentMdFiles = result.files;
}

export async function initSkills(): Promise<void> {
  // Skills are already loaded in main/index.ts
}

export { getLoadedSkills } from './skills/loader';

// Re-export for main/index.ts
export { getConfig, setConfig, saveConfig } from './config';
