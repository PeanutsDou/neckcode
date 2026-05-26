import { getDb } from '../session-store';

interface RecentFile {
  path: string;
  name: string;
  isDir: boolean;
  source: string;
  openCount: number;
  lastOpenedAt: number;
}

export function initRecentFiles(): void {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS quick_recent_files (
      path TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      is_dir INTEGER NOT NULL,
      source TEXT NOT NULL,
      open_count INTEGER NOT NULL DEFAULT 0,
      last_opened_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_quick_recent_opened ON quick_recent_files(last_opened_at DESC);
  `);
}

export function recordOpen(filePath: string, isDir: boolean, source: string): void {
  const db = getDb();
  const name = filePath.split(/[\\/]/).pop() || filePath;
  const now = Date.now();
  db.prepare(`
    INSERT INTO quick_recent_files (path, name, is_dir, source, open_count, last_opened_at)
    VALUES (?, ?, ?, ?, 1, ?)
    ON CONFLICT(path) DO UPDATE SET
      open_count = quick_recent_files.open_count + 1,
      last_opened_at = excluded.last_opened_at,
      source = excluded.source
  `).run(filePath, name, isDir ? 1 : 0, source, now);
}

export function searchRecent(query: string, limit = 10): RecentFile[] {
  const db = getDb();
  const q = `%${query.replace(/[%_]/g, '\\$&')}%`;
  const rows = db.prepare(`
    SELECT * FROM quick_recent_files
    WHERE name LIKE ? OR path LIKE ?
    ORDER BY last_opened_at DESC
    LIMIT ?
  `).all(q, q, limit) as Array<Record<string, unknown>>;
  return rows.map((r) => ({
    path: r.path as string,
    name: r.name as string,
    isDir: Boolean(r.is_dir),
    source: r.source as string,
    openCount: r.open_count as number,
    lastOpenedAt: r.last_opened_at as number,
  }));
}

export function listRecent(limit = 20): RecentFile[] {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM quick_recent_files ORDER BY last_opened_at DESC LIMIT ?')
    .all(limit) as Array<Record<string, unknown>>;
  return rows.map((r) => ({
    path: r.path as string,
    name: r.name as string,
    isDir: Boolean(r.is_dir),
    source: r.source as string,
    openCount: r.open_count as number,
    lastOpenedAt: r.last_opened_at as number,
  }));
}
