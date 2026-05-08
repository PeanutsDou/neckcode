import { contextBridge, ipcRenderer } from 'electron';

console.log('[preload] loading...');

const api = {
  // Agent
  sendMessage: (text: string, attachments?: { type: string; data: string; mimeType: string }[]) => {
    return ipcRenderer.invoke('agent:send-message', text, attachments || []);
  },
  abort: () => ipcRenderer.invoke('agent:abort'),
  compare: (text: string, models: string[]) => ipcRenderer.invoke('agent:compare', text, models),

  // Agent events
  onDelta: (cb: (text: string) => void) => {
    const listener = (_event: unknown, text: string) => cb(text);
    ipcRenderer.on('agent:delta', listener);
    return () => { ipcRenderer.removeListener('agent:delta', listener); };
  },
  onToolStart: (cb: (data: unknown) => void) => {
    const listener = (_event: unknown, data: unknown) => cb(data);
    ipcRenderer.on('agent:tool-start', listener);
    return () => { ipcRenderer.removeListener('agent:tool-start', listener); };
  },
  onToolResult: (cb: (data: unknown) => void) => {
    const listener = (_event: unknown, data: unknown) => cb(data);
    ipcRenderer.on('agent:tool-result', listener);
    return () => { ipcRenderer.removeListener('agent:tool-result', listener); };
  },
  onTurnDone: (cb: (data: unknown) => void) => {
    const listener = (_event: unknown, data: unknown) => cb(data);
    ipcRenderer.on('agent:turn-done', listener);
    return () => { ipcRenderer.removeListener('agent:turn-done', listener); };
  },
  onError: (cb: (msg: string) => void) => {
    const listener = (_event: unknown, msg: string) => cb(msg);
    ipcRenderer.on('agent:error', listener);
    return () => { ipcRenderer.removeListener('agent:error', listener); };
  },

  // Config
  getConfig: () => ipcRenderer.invoke('config:get'),
  setConfig: (key: string, value: unknown) => ipcRenderer.invoke('config:set', key, value),
  getProviders: () => ipcRenderer.invoke('config:get-providers'),
  setProvider: (id: string, config: unknown) => ipcRenderer.invoke('config:set-provider', id, config),

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
};

contextBridge.exposeInMainWorld('electronAPI', api);
console.log('[preload] electronAPI exposed');
