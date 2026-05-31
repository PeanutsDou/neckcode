const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('petAPI', {
  onSetState: (callback: (state: string, file: string, theme: string) => void): void => {
    ipcRenderer.on('pet:set-state', (_e: Electron.IpcRendererEvent, state: string, file: string, theme: string) => {
      callback(state, file, theme);
    });
  },
  onSay: (callback: (text: string) => void): void => {
    ipcRenderer.on('pet:say', (_e: Electron.IpcRendererEvent, text: string) => {
      callback(text);
    });
  },
  moveWindow: (dx: number, dy: number): void => {
    ipcRenderer.send('pet:move', dx, dy);
  },
});
