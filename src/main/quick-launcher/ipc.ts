import { ipcMain } from 'electron';
import {
  getQuickLauncherState,
  hideQuickLauncher,
  resizeQuickLauncher,
  setQuickLauncherExpanded,
  setQuickLauncherMode,
  showQuickLauncher,
  toggleQuickLauncher,
} from './window';
import { quickFindLocalSearch, quickFindOpen } from './find';
import { initRecentFiles } from './recent-files';

let registered = false;

export function setupQuickLauncherIpc(): void {
  if (registered) return;
  registered = true;

  initRecentFiles();

  ipcMain.handle('quick-launcher:show', () => {
    showQuickLauncher();
  });

  ipcMain.handle('quick-launcher:hide', () => {
    hideQuickLauncher();
  });

  ipcMain.handle('quick-launcher:toggle', () => {
    toggleQuickLauncher();
  });

  ipcMain.handle('quick-launcher:get-state', () => getQuickLauncherState());

  ipcMain.handle('quick-launcher:set-mode', (_event, mode: 'chat' | 'find') => {
    if (mode === 'chat' || mode === 'find') setQuickLauncherMode(mode);
  });

  ipcMain.handle('quick-launcher:set-expanded', (_event, expanded: boolean) => {
    setQuickLauncherExpanded(Boolean(expanded));
  });

  ipcMain.handle('quick-launcher:resize', (_event, height: number) => {
    resizeQuickLauncher(Number(height) || 44);
  });

  ipcMain.handle('quick-find:local-search', async (_event, query: string) => {
    return quickFindLocalSearch(String(query || ''), { limit: 8 });
  });

  ipcMain.handle('quick-find:open', async (_event, path: string, reveal?: boolean) => {
    return quickFindOpen(String(path || ''), Boolean(reveal));
  });
}
