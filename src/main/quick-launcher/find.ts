import { promises as fs } from 'fs';
import { basename, extname, join } from 'path';
import { homedir } from 'os';
import { shell } from 'electron';
import { getConfig } from '../config';
import { recordOpen, searchRecent } from './recent-files';
import { everythingSearch, isEverythingAvailable, initEverything } from './everything';

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

function defaultRoots(): Array<{ path: string; source: string; maxDepth: number }> {
  const home = homedir();
  const workspace = getConfig().agent.workspaceRoot;
  const roots: Array<{ path: string; source: string; maxDepth: number }> = [
    { path: join(home, 'Desktop'), source: 'desktop', maxDepth: 4 },
    { path: join(home, 'Downloads'), source: 'downloads', maxDepth: 3 },
    { path: join(home, 'Documents'), source: 'documents', maxDepth: 4 },
    { path: join(home, 'OneDrive'), source: 'onedrive', maxDepth: 3 },
    { path: workspace, source: 'workspace', maxDepth: 2 },
  ];

  // 添加所有非系统盘符的根目录（D:\, E:\ 等，浅扫一层）
  const { execSync } = require('child_process');
  try {
    const wmic = execSync('wmic logicaldisk get name', { timeout: 2000, windowsHide: true }).toString();
    const drives = wmic.match(/[A-Z]:/g) || [];
    for (const d of drives) {
      const driveRoot = `${d}\\`;
      if (driveRoot === 'C:\\') continue; // C 盘太深，跳过
      // 避免重复（如 workspace 已经在某盘符下）
      if (roots.some(r => r.path.startsWith(driveRoot))) continue;
      roots.push({ path: driveRoot, source: 'drive', maxDepth: 1 });
    }
  } catch { /* wmic 不可用时跳过 */ }

  return roots;
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
  
  // 核心：文件名必须包含查询关键词，否则不给分
  const nameMatch = nName.includes(nQuery);
  if (!nameMatch) {
    // 检查是否有任意关键词部分匹配文件名
    let anyPartMatch = false;
    for (const part of parts) {
      if (part && nName.includes(normalize(part))) { anyPartMatch = true; break; }
    }
    if (!anyPartMatch) return 0; // 文件名完全不匹配 → 排除
  }
  
  // 基础分
  if (nName === nQuery) score += 100;
  else if (nName.startsWith(nQuery)) score += 70;
  else if (nName.includes(nQuery)) score += 50;
  
  // 路径匹配（仅小加分）
  if (nPath.includes(nQuery)) score += 8;
  
  // 每个关键词额外加分
  for (const part of parts) {
    const np = normalize(part);
    if (!np || np === nQuery) continue;
    if (nName.includes(np)) score += 20;
    else if (nPath.includes(np)) score += 5;
  }
  
  if (isDir) score += 8;
  // 最近文件的时间加分
  const ageDays = Math.max(0, (Date.now() - mtimeMs) / 86400000);
  score += Math.max(0, 6 - Math.min(6, ageDays / 60));
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
  const limit = options?.limit ?? 10;
  const results: QuickFindResult[] = [];

  // 阶段 0：Everything 全盘搜索（< 50ms，覆盖所有 NTFS 卷）
  if (isEverythingAvailable()) {
    try {
      const er = await everythingSearch(text, limit * 2);
      for (const r of er) {
        results.push({
          id: r.fullPath, path: r.fullPath, name: r.name,
          isDir: r.isFolder, score: 90, source: 'everything',
          mtimeMs: r.modified?.getTime(), size: r.size,
        });
      }
      if (results.length >= limit) return results.slice(0, limit);
    } catch { /* 降级 */ }
  }

  // 阶段 1a：优先从最近文件检索
  const recents = searchRecent(text, 10);
  for (const r of recents) {
    results.push({
      id: r.path,
      path: r.path,
      name: r.name,
      isDir: r.isDir,
      score: r.openCount * 5 + 40,
      source: 'recent',
    });
  }

  // 阶段 1b：文件系统扫描
  const defaultMaxDepth = options?.maxDepth ?? getConfig().quickLauncher?.findMaxDepth ?? 4;
  for (const root of defaultRoots()) {
    const depth = Math.min(root.maxDepth, defaultMaxDepth);
    await scanDir(root.path, root.source, text, parts, depth, results);
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
  if (!error) {
    // 记录到最近文件（设计需求：追踪用户打开的文件供快速检索）
    try {
      const stat = await fs.stat(path);
      recordOpen(path, stat.isDirectory(), 'quickfind');
    } catch { /* stat 失败不影响 */ }
  }
  return error ? { ok: false, error } : { ok: true };
}

export function compactPath(path: string): string {
  const home = homedir();
  return path.startsWith(home) ? `~${path.slice(home.length)}` : path;
}
