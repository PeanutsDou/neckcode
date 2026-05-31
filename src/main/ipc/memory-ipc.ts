import { ipcMain } from 'electron';
import { promises as fs } from 'fs';
import { join, resolve } from 'path';
import { getConfig } from '../config';
import { APP_DATA_DIR_NAME, LEGACY_APP_DATA_DIR_NAME, legacyUserDataDir, userDataDir } from '../app-paths';
import { assertPathInAllowedRoots } from '../safe-paths';

function allowedMemoryRoots(): string[] {
  return [
    join(getConfig().agent.workspaceRoot, APP_DATA_DIR_NAME, 'memory'),
    join(getConfig().agent.workspaceRoot, LEGACY_APP_DATA_DIR_NAME, 'memory'),
    join(userDataDir(), 'memory'),
    join(legacyUserDataDir(), 'memory'),
  ];
}

function assertMemoryPath(filePath: string): string {
  return assertPathInAllowedRoots(filePath, allowedMemoryRoots(), 'memory path');
}

export function registerMemoryIpc(): void {
  ipcMain.handle('memory:list', async () => {
    const seen = new Set<string>();
    const dirs = allowedMemoryRoots().filter((dir) => {
      const normalized = resolve(dir);
      if (seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    });

    const results: Array<{ name: string; path: string }> = [];
    for (const memDir of dirs) {
      try {
        const entries = await fs.readdir(memDir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isFile() && entry.name.endsWith('.md')) {
            results.push({ name: entry.name.replace('.md', ''), path: join(memDir, entry.name) });
          }
        }
      } catch {
        // Missing memory directories are normal.
      }
    }
    return results;
  });

  ipcMain.handle('memory:read', async (_event, filePath: string) => {
    return await fs.readFile(assertMemoryPath(filePath), 'utf8');
  });

  ipcMain.handle('memory:delete', async (_event, filePath: string) => {
    const safePath = assertMemoryPath(filePath);
    if (safePath.toLowerCase().endsWith('agent.md')) {
      throw new Error('AGENT.md cannot be deleted');
    }
    await fs.unlink(safePath);
  });

  ipcMain.handle('memory:write', async (_event, filePath: string, content: string) => {
    await fs.writeFile(assertMemoryPath(filePath), content, 'utf8');
  });
}
