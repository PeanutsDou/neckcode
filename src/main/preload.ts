import { contextBridge, ipcRenderer } from 'electron';

console.log('[preload] loading...');

const api = {
  // Agent
  sendMessage: (sessionId: string, text: string, attachments?: { type: string; data: string; mimeType: string }[]) => {
    return ipcRenderer.invoke('agent:send-message', sessionId, text, attachments || []);
  },
  regenerate: (sessionId: string, text: string, attachments?: { type: string; data: string; mimeType: string }[]) => {
    return ipcRenderer.invoke('agent:regenerate', sessionId, text, attachments || []);
  },
  abort: (sessionId: string) => ipcRenderer.invoke('agent:abort', sessionId),
  resetAgent: (sessionId: string) => ipcRenderer.invoke('agent:reset', sessionId),
  setAgentContext: (sessionId: string, messages: unknown[]) => ipcRenderer.invoke('agent:set-context', sessionId, messages),

  // Agent events — now include sessionId as first argument
  onDelta: (cb: (sid: string, text: string) => void) => {
    const listener = (_event: unknown, sid: string, text: string) => cb(sid, text);
    ipcRenderer.on('agent:delta', listener);
    return () => { ipcRenderer.removeListener('agent:delta', listener); };
  },
  onThinkingDelta: (cb: (sid: string, text: string) => void) => {
    const listener = (_event: unknown, sid: string, text: string) => cb(sid, text);
    ipcRenderer.on('agent:thinking-delta', listener);
    return () => { ipcRenderer.removeListener('agent:thinking-delta', listener); };
  },
  onToolStart: (cb: (sid: string, data: unknown) => void) => {
    const listener = (_event: unknown, sid: string, data: unknown) => cb(sid, data);
    ipcRenderer.on('agent:tool-start', listener);
    return () => { ipcRenderer.removeListener('agent:tool-start', listener); };
  },
  onToolResult: (cb: (sid: string, data: unknown) => void) => {
    const listener = (_event: unknown, sid: string, data: unknown) => cb(sid, data);
    ipcRenderer.on('agent:tool-result', listener);
    return () => { ipcRenderer.removeListener('agent:tool-result', listener); };
  },
  onTurnDone: (cb: (sid: string, data: unknown) => void) => {
    const listener = (_event: unknown, sid: string, data: unknown) => cb(sid, data);
    ipcRenderer.on('agent:turn-done', listener);
    return () => { ipcRenderer.removeListener('agent:turn-done', listener); };
  },
  onError: (cb: (sid: string, msg: string) => void) => {
    const listener = (_event: unknown, sid: string, msg: string) => cb(sid, msg);
    ipcRenderer.on('agent:error', listener);
    return () => { ipcRenderer.removeListener('agent:error', listener); };
  },

  // Config
  getConfig: () => ipcRenderer.invoke('config:get'),
  setConfig: (key: string, value: unknown) => ipcRenderer.invoke('config:set', key, value),
  getProviders: () => ipcRenderer.invoke('config:get-providers'),
  setProvider: (pc: unknown) => ipcRenderer.invoke('config:set-provider', pc),
  deleteProvider: (id: string) => ipcRenderer.invoke('config:delete-provider', id),

  // File system (direct, not through agent)
  listDir: (dirPath: string) => ipcRenderer.invoke('fs:list-dir', dirPath),
  readFile: (filePath: string) => ipcRenderer.invoke('fs:read-file', filePath),
  writeFile: (filePath: string, content: string) => ipcRenderer.invoke('fs:write-file', filePath, content),

  // Window controls
  minimize: () => ipcRenderer.invoke('window:minimize'),
  maximize: () => ipcRenderer.invoke('window:maximize'),
  close: () => ipcRenderer.invoke('window:close'),

  // Terminal
  startTerminal: () => ipcRenderer.invoke('terminal:start'),
  writeTerminal: (text: string) => ipcRenderer.invoke('terminal:write', text),
  stopTerminal: () => ipcRenderer.invoke('terminal:stop'),
  onTerminalData: (cb: (data: string) => void) => {
    const listener = (_: unknown, data: string) => cb(data);
    ipcRenderer.on('terminal:data', listener);
    return () => { ipcRenderer.removeListener('terminal:data', listener); };
  },

  // Session persistence
  saveSession: (session: unknown) => ipcRenderer.invoke('session:save', session),
  loadSession: (id: string) => ipcRenderer.invoke('session:load', id),
  listSessions: () => ipcRenderer.invoke('session:list'),
  deleteSession: (id: string) => ipcRenderer.invoke('session:delete', id),
  renameSession: (id: string, title: string) => ipcRenderer.invoke('session:rename', id, title),
  generateTitle: (message: string) => ipcRenderer.invoke('session:generate-title', message),

  // Skills
  listSkills: () => ipcRenderer.invoke('skills:list'),
  invokeSkill: (name: string) => ipcRenderer.invoke('skills:invoke', name),
  writeSkillContent: (name: string, content: string) => ipcRenderer.invoke('skills:write-content', name, content),
  deleteSkill: (name: string) => ipcRenderer.invoke('skills:delete', name),
  getAgentMd: () => ipcRenderer.invoke('agent-md:get'),
  listMemory: () => ipcRenderer.invoke('memory:list'),
  readMemory: (path: string) => ipcRenderer.invoke('memory:read', path),
  writeMemory: (path: string, content: string) => ipcRenderer.invoke('memory:write', path, content),
  deleteMemory: (path: string) => ipcRenderer.invoke('memory:delete', path),

  // Ask user question
  onAskShow: (cb: (sessionId: string, askId: string, questions: unknown[]) => void) => {
    const listener = (_: unknown, sessionId: string, askId: string, questions: unknown[]) => cb(sessionId, askId, questions);
    ipcRenderer.on('ask:show', listener);
    return () => { ipcRenderer.removeListener('ask:show', listener); };
  },
  respondToAsk: (askId: string, answers: Record<string, string> | null) => {
    return ipcRenderer.invoke('ask:respond', askId, answers);
  },
  onConfirmShow: (cb: (sessionId: string, confirmId: string, message: string) => void) => {
    const listener = (_: unknown, sessionId: string, confirmId: string, message: string) => cb(sessionId, confirmId, message);
    ipcRenderer.on('confirm:show', listener);
    return () => { ipcRenderer.removeListener('confirm:show', listener); };
  },
  respondToConfirm: (confirmId: string, approved: boolean) => {
    return ipcRenderer.invoke('confirm:respond', confirmId, approved);
  },

  // Dialog
  pickDirectory: () => ipcRenderer.invoke('dialog:pick-dir'),

  // Permissions
  getPermissionMode: () => ipcRenderer.invoke('permission:get'),
  setPermissionMode: (mode: string) => ipcRenderer.invoke('permission:set', mode),
};

contextBridge.exposeInMainWorld('electronAPI', api);
console.log('[preload] electronAPI exposed');
