import { promises as fs } from 'fs';
import { basename, extname, join } from 'path';
import { homedir } from 'os';
import { shell } from 'electron';
import { getConfig } from '../config';

export interface QuickFindResult {
  id: string;
  path: string;
  name: string;
  isDir: boolean;
  score: number;
  source: string;
  mtimeMs?: number;
  size?: number;
}

const EXCLUDED = new Set(['node_modules', '.git', 'dist', 'release', '.next', '.cache', 'AppData']);
const ACTION_WORDS = ['帮我', '打开', '查找', '搜索', '找', '文件夹', '文件', '目录', '一下', '这个', '那个'];

function defaultRoots(): Array<{ path: string; source: string }> {
  const home = homedir();
  const workspace = getConfig().agent.workspaceRoot;
  return [
    { path: join(home, 'Desktop'), source: 'desktop' },
    { path: join(home, 'Downloads'), source: 'downloads' },
    { path: join(home, 'Documents'), source: 'documents' },
    { path: workspace, source: 'workspace' },
  ];
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/[\\/_\-.\s]+/g, '');
}

function keywords(query: string): string[] {
  let cleaned = query.trim();
  for (const word of ACTION_WORDS) cleaned = cleaned.replaceAll(word, ' ');
  return cleaned
    .split(/[\s,，。/\\]+/)
    .map(part => part.trim())
    .filter(Boolean);
}

function scoreEntry(name: string, fullPath: string, query: string, parts: string[], isDir: boolean, mtimeMs: number, source: string): number {
  const nName = normalize(name);
  const nPath = normalize(fullPath);
  const nQuery = normalize(query);
  let score = 0;
  if (nName === nQuery) score += 100;
  if (nName.includes(nQuery)) score += 60;
  if (nPath.includes(nQuery)) score += 25;
  for (const part of parts) {
    const np = normalize(part);
    if (!np) continue;
    if (nName.includes(np)) score += 30;
    else if (nPath.includes(np)) score += 12;
  }
  if (isDir) score += 8;
  if (source === 'workspace') score += 5;
  const ageDays = Math.max(0, (Date.now() - mtimeMs) / 86400000);
  score += Math.max(0, 10 - Math.min(10, ageDays / 30));
  return score;
}

async function scanDir(root: string, source: string, query: string, parts: string[], maxDepth: number, results: QuickFindResult[]): Promise<void> {
  async function walk(dir: string, depth: number): Promise<void> {
    if (depth > maxDepth || results.length > 80) return;
    let entries: import('fs').Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    await Promise.all(entries.slice(0, 300).map(async entry => {
      if (EXCLUDED.has(entry.name)) return;
      const fullPath = join(dir, entry.name);
      let stat;
      try {
        stat = await fs.stat(fullPath);
      } catch {
        return;
      }
      const isDir = entry.isDirectory();
      const score = scoreEntry(entry.name, fullPath, query, parts, isDir, stat.mtimeMs, source);
      if (score > 20) {
        results.push({
          id: fullPath,
          path: fullPath,
          name: entry.name,
          isDir,
          score,
          source,
          mtimeMs: stat.mtimeMs,
          size: stat.size,
        });
      }
      if (isDir) await walk(fullPath, depth + 1);
    }));
  }
  await walk(root, 0);
}

export async function quickFindLocalSearch(query: string, options?: { maxDepth?: number; limit?: number }): Promise<QuickFindResult[]> {
  const text = query.trim();
  if (!text) return [];
  const parts = keywords(text);
  const results: QuickFindResult[] = [];
  const maxDepth = options?.maxDepth ?? getConfig().quickLauncher?.findMaxDepth ?? 4;
  for (const root of defaultRoots()) {
    await scanDir(root.path, root.source, text, parts, maxDepth, results);
  }
  const seen = new Set<string>();
  return results
    .sort((a, b) => b.score - a.score)
    .filter(result => {
      if (seen.has(result.path)) return false;
      seen.add(result.path);
      return true;
    })
    .slice(0, options?.limit ?? 10);
}

export async function quickFindOpen(path: string, reveal = false): Promise<{ ok: boolean; error?: string }> {
  if (reveal) {
    shell.showItemInFolder(path);
    return { ok: true };
  }
  const error = await shell.openPath(path);
  return error ? { ok: false, error } : { ok: true };
}

export function compactPath(path: string): string {
  const home = homedir();
  return path.startsWith(home) ? `~${path.slice(home.length)}` : path;
}
