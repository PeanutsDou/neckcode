import type { ElectronAPI, FileEntry } from '../shared/electron-api';

export type { ElectronAPI, FileEntry };

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
