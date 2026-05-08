import { contextBridge, ipcRenderer } from 'electron';

console.log('[preload] loading...');

const api = {
  sendMessage: (text: string) => {
    console.log('[preload] sendMessage called:', text);
    return ipcRenderer.invoke('agent:send-message', text);
  },
  abort: () => ipcRenderer.invoke('agent:abort'),
  getConfig: () => ipcRenderer.invoke('config:get'),

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
};

contextBridge.exposeInMainWorld('electronAPI', api);
console.log('[preload] electronAPI exposed');
