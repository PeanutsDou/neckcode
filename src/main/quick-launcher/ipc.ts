import { ipcMain } from 'electron';
import {
  getQuickLauncherState,
  hideQuickLauncher,
  setQuickLauncherExpanded,
  setQuickLauncherMode,
  showQuickLauncher,
  toggleQuickLauncher,
} from './window';
import { quickFindLocalSearch, quickFindOpen } from './find';

let registered = false;

export function setupQuickLauncherIpc(): void {
  if (registered) return;
  registered = true;

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

  ipcMain.handle('quick-find:local-search', async (_event, query: string) => {
    return quickFindLocalSearch(String(query || ''), { limit: 8 });
  });

  ipcMain.handle('quick-find:agent-search', async (_event, query: string) => {
    // Phase 5 fallback keeps the same safe, local-only boundary but searches slightly deeper.
    return quickFindLocalSearch(String(query || ''), { maxDepth: 6, limit: 12 });
  });

  ipcMain.handle('quick-find:open', async (_event, path: string, reveal?: boolean) => {
    return quickFindOpen(String(path || ''), Boolean(reveal));
  });
}
