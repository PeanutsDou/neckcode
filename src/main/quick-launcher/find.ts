import { promises as fs, existsSync, statSync } from 'fs';
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


function isPathQuery(query: string): boolean {
  // 包含盘符、斜杠、反斜杠，或多段路径片段（空格分隔且至少两段含盘符特征）
  if (/[A-Za-z]:/.test(query)) return true;
  if (/[/\\]/.test(query)) return true;
  // 空格分隔的多个片段，其中一个像路径片段
  const parts = query.trim().split(/\s+/);
  if (parts.length >= 2) {
    // 包含盘符字母 或 有扩展名的文件名
    if (parts.some(p => /^[A-Za-z]$/.test(p) || /\.[a-zA-Z0-9]{1,6}$/.test(p))) return true;
  }
  return false;
}



function resolvePathFromQuery(query: string): string | null {
  const parts = query.trim().split(/[\s/\\\\]+/).filter(Boolean);
  if (parts.length === 0) return null;
  const first = parts[0];

  // Case 1: single drive letter "D" or "d" → D:\
  if (/^[A-Za-z]$/.test(first) && parts.length === 1) {
    return first.toUpperCase() + ':' + '\\';
  }

  // Case 2: "D douzhongjun" or "D:/douzhongjun" → D:\douzhongjun
  if (/^[A-Za-z]$/.test(first)) {
    const drive = first.toUpperCase() + ':' + '\\';
    const rest = parts.slice(1).join('\\');
    return drive + rest;
  }

  // Case 3: "douzhongjun" (single word) → try common roots
  if (parts.length === 1) {
    const { homedir } = require('os');
    // Check homedir parent (C:\Users\douzhongjun) vs literal
    const candidates = [
      join(homedir(), first),
      join('C:\\Users', first),
      join('D:\\', first),
      join('E:\\', first),
    ];
    for (const c of candidates) {
      try {
        const stat = statSync(c);
        if (stat.isDirectory()) return c;
      } catch {}
    }
    // Also try Everything SDK for exact name match
    try {
      const { everythingSearch } = require('./everything');
      const results = everythingSearch(first, 3); // folders only
      if (results && results.length > 0) {
        return results[0].fullPath;
      }
    } catch {}
    return null;
  }

  // Case 4: "douzhongjun work" → find the "douzhongjun" dir, then append "work"
  const { homedir } = require('os');
  let base = null;
  const baseCandidates = [
    join(homedir(), first),
    join('C:\\Users', first),
    join('D:\\', first),
  ];
  for (const c of baseCandidates) {
    try {
      const stat = statSync(c);
      if (stat.isDirectory()) { base = c; break; }
    } catch {}
  }
  if (base) {
    const rest = parts.slice(1).join('\\');
    return join(base, rest);
  }

  // Case 5: full path like "C:/Users/douzhongjun/..."
  const joined = parts.join('\\');
  if (/^[A-Za-z]:/.test(joined)) return joined;

  return null;
}

// Check if a path prefix exists and return the highest-level existing dir
async function findExistingPrefix(candidate: string): Promise<string | null> {
  const { join } = require('path');
  // Try exact path first
  try { await fs.access(candidate); return candidate; } catch {}
  // Try parent directories
  let current = candidate;
  for (let i = 0; i < 3; i++) {
    const parent = join(current, '..');
    if (parent === current) break;
    try { await fs.access(parent); return parent; } catch {}
    current = parent;
  }
  return null;
}
function pathMatch(queryParts: string[], fullPath: string): number {
  const lower = fullPath.toLowerCase();
  let score = 0;
  let consecutive = 0;
  for (const part of queryParts) {
    const p = part.toLowerCase();
    if (lower.includes(p)) {
      consecutive++;
      score += 30 + consecutive * 10; // 连续匹配加分
    } else {
      consecutive = 0;
    }
  }
  if (consecutive > 1) score += 40; // 多段连续匹配加成
  return score;
}
function scoreEntry(name: string, fullPath: string, query: string, parts: string[], isDir: boolean, mtimeMs: number, source: string, isPath?: boolean): number {
  const nName = normalize(name);
  const nPath = normalize(fullPath);
  const nQuery = normalize(query);
  let score = 0;
  
  // 路径模式：匹配完整路径，不要求文件名匹配
  if (isPath) {
    const pathScore = pathMatch(parts, fullPath);
    if (pathScore > 0) return pathScore + (isDir ? 5 : 0);
    return 0; // 路径模式下，完全不匹配路径则排除
  }
  
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
  
  // 收藏加分（最高优先级）
  const favorites = getConfig().quickLauncher?.favorites || [];
  if (favorites.includes(fullPath)) score += 500;
  if (isDir) score += 8;
  // 最近文件的时间加分
  const ageDays = Math.max(0, (Date.now() - mtimeMs) / 86400000);
  score += Math.max(0, 6 - Math.min(6, ageDays / 60));
  return score;
}

async function scanDir(root: string, source: string, query: string, parts: string[], maxDepth: number, results: QuickFindResult[], isPath: boolean): Promise<void> {
  async function walk(dir: string, depth: number): Promise<void> {
    if (depth > maxDepth || results.length > 80) return;
    let entries: import('fs').Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    await Promise.all(entries.slice(0, 300).map(async (entry, idx) => {
      // 每处理 20 个条目让出主线程，避免扫描卡顿 UI
      if (idx > 0 && idx % 20 === 0) {
        await new Promise(resolve => setImmediate(resolve));
      }
      if (EXCLUDED.has(entry.name)) return;
      const fullPath = join(dir, entry.name);
      let stat;
      try {
        stat = await fs.stat(fullPath);
      } catch {
        return;
      }
      const isDir = entry.isDirectory();
      const score = scoreEntry(entry.name, fullPath, query, parts, isDir, stat.mtimeMs, source, isPath);
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

export async function quickFindLocalSearch(query: string, favoritesList?: string[], options?: { maxDepth?: number; limit?: number }): Promise<QuickFindResult[]> {
  const text = query.trim();
  if (!text) return [];
  const parts = keywords(text);
  const isPath = isPathQuery(text);
  const limit = options?.limit ?? 10;
  const results: QuickFindResult[] = [];

  // 阶段 -1：收藏列表优先匹配（纯内存，0 延迟）
  const favorites = favoritesList ?? getConfig().quickLauncher?.favorites ?? [];
  if (favorites.length > 0) {
    const lowerText = text.toLowerCase();
    const nText = normalize(text);
    for (const fav of favorites) {
      const name = basename(fav);
      if (
        fav.toLowerCase().includes(lowerText) ||
        normalize(name).includes(nText) ||
        (isPath && pathMatch(parts, fav) > 0)
      ) {
        // 验证路径仍然存在
        try { await fs.access(fav); } catch { continue; }
        const stat = await fs.stat(fav).catch(() => null);
        results.push({
          id: fav,
          path: fav,
          name,
          isDir: stat?.isDirectory() ?? !extname(fav),
          score: 999,
          source: 'favorite',
          mtimeMs: stat?.mtimeMs,
          size: stat?.size,
        });
      }
    }
  }

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

  // 路径模式：直接从查询中提取目录路径并扫描
  if (isPath) {
    const resolvedPath = resolvePathFromQuery(text);
    if (resolvedPath) {
      const existingDir = await findExistingPrefix(resolvedPath);
      if (existingDir) {
        // 深度扫描这个目录（使用路径模式匹配）
        await scanDir(existingDir, 'path', text, parts, 3, results, true);
      }
    }
  }

  // 文件系统扫描（普通模式）
  if (!isPath) {
  // 阶段 1b：文件系统扫描（普通模式）
  const defaultMaxDepth = options?.maxDepth ?? getConfig().quickLauncher?.findMaxDepth ?? 4;
  for (const root of defaultRoots()) {
    const depth = Math.min(root.maxDepth, defaultMaxDepth);
    await scanDir(root.path, root.source, text, parts, depth, results, isPath);
  }

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
