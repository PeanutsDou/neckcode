/**
 * Everything 全盘搜索引擎（基于 es.exe CLI + Everything 后台服务）
 * 
 * Everything 通过 NTFS MFT 直接索引全盘，百万文件 < 50ms 查询。
 * 总占用：everything.exe (2.2MB) + es.exe (155KB) + DB (~50-100MB)
 * 
 * 启动逻辑：
 *   1. es.exe -version 检测 Everything 是否在运行
 *   2. 若不在：用 -startup 后台启动（需 Everything.ini 已存在）
 *   3. 首次使用需运行一次 GUI 模式生成 Everything.ini
 */
import { execFile } from 'child_process';
import { join, dirname } from 'path';
import { existsSync } from 'fs';
import { app } from 'electron';
import * as iconv from 'iconv-lite';

// === 路径配置 ===
const PROJECT_ROOT = app.isPackaged
  ? join(process.resourcesPath, 'app.asar.unpacked')
  : app.getAppPath(); // dev 模式下就是项目根 D:\AR\neckcode

const EVERYTHING_DIR = join(PROJECT_ROOT, 'everything');
const ES_EXE = join(EVERYTHING_DIR, 'es.exe');
const EVERYTHING_EXE = join(EVERYTHING_DIR, 'everything.exe');

// === 状态 ===
let available = false;
let initPromise: Promise<boolean> | null = null;

export interface EverythingResult {
  name: string;
  path: string;
  fullPath: string;
  size?: number;
  modified?: Date;
  isFolder: boolean;
  isFile: boolean;
}

// === 内部工具 ===

function parseOutput(stdout: string): EverythingResult[] {
  const lines = stdout.trim().split('\n');
  if (lines.length < 2) return [];
  
  // CSV 格式：Size,Date Modified,Attributes,Filename
  // 第一行是表头，跳过
  return lines.slice(1).map(line => {
    // 简单 CSV 解析：处理引号包裹的字段
    const parts: string[] = [];
    let current = '';
    let inQuotes = false;
    for (const ch of line) {
      if (ch === '"') { inQuotes = !inQuotes; continue; }
      if (ch === ',' && !inQuotes) { parts.push(current.trim()); current = ''; continue; }
      current += ch;
    }
    parts.push(current.trim());
    
    const size = parts[0] ? parseInt(parts[0], 10) : undefined;
    const modified = parts[1] ? new Date(parts[1]) : undefined;
    const attrs = parts[2] || '';
    const fullPath = parts[3] || '';
    const name = fullPath.split('\\').pop() || fullPath;
    const path = fullPath.substring(0, fullPath.lastIndexOf('\\')) || fullPath;
    
    return {
      name,
      path,
      fullPath,
      size,
      modified,
      isFile: !attrs.includes('D'),
      isFolder: attrs.includes('D'),
    };
  }).filter(r => r.fullPath);
}

// 获取系统 ANSI 代码页（中文 Windows 为 936 = GBK）
function getSystemCodePage(): string {
  try {
    const { execSync } = require('child_process');
    const out = execSync('chcp', { encoding: 'utf8', windowsHide: true, timeout: 2000 }).toString();
    const m = out.match(/(\d+)/);
    return m ? m[1] : '936';
  } catch {
    return '936'; // 默认 GBK
  }
}

let _codePage: string | null = null;
function decodeBuffer(buf: Buffer): string {
  if (!_codePage) _codePage = getSystemCodePage();
  // 代码页 65001 = UTF-8
  if (_codePage === '65001') return buf.toString('utf8');
  return iconv.decode(buf, 'cp' + _codePage);
}

function esExecBuffer(args: string[], timeout = 5000): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    execFile(ES_EXE, args, {
      maxBuffer: 10 * 1024 * 1024,
      windowsHide: true,
      timeout,
      encoding: 'buffer' as any,
    }, (err, stdout) => {
      if (err) return reject(err);
      resolve(stdout as Buffer || Buffer.alloc(0));
    });
  });
}

function esExec(args: string[], timeout = 5000): Promise<string> {
  return esExecBuffer(args, timeout).then(buf => decodeBuffer(buf));
}

async function isRunning(): Promise<boolean> {
  try {
    const out = await esExec(['-version'], 3000);
    return out.trim().length > 0;
  } catch {
    return false;
  }
}

async function startBackground(): Promise<boolean> {
  if (!existsSync(EVERYTHING_EXE)) return false;
  
  // 如果 Everything.ini 不存在，需要先 GUI 运行一次
  const iniPath = join(EVERYTHING_DIR, 'Everything.ini');
  if (!existsSync(iniPath)) {
    console.log('[QuickFinder] First run: initializing Everything (GUI)...');
    try {
      await new Promise<void>((resolve, reject) => {
        const proc = execFile(EVERYTHING_EXE, [], { windowsHide: false }, (err) => {
          err ? reject(err) : resolve();
        });
        // GUI 启动后立即退出，Everything 会在后台继续运行
      });
      // 等待 Everything 完成初始化
      await new Promise(r => setTimeout(r, 5000));
      // 关掉 GUI，改用 -startup 后台模式
      try { 
        await esExec(['-exit'], 2000);
        await new Promise(r => setTimeout(r, 1000));
      } catch {}
    } catch { /* 可能已经启动了 */ }
  }

  // 用 -startup 后台模式启动
  try {
    await new Promise<void>((resolve, reject) => {
      execFile(EVERYTHING_EXE, ['-startup'], { windowsHide: true }, (err) => {
        err ? reject(err) : resolve();
      });
    });
  } catch { /* 可能已经运行 */ }

  // 等待就绪
  for (let i = 0; i < 15; i++) {
    await new Promise(r => setTimeout(r, 1000));
    if (await isRunning()) return true;
  }
  return false;
}

// === 公开 API ===

export async function initEverything(): Promise<boolean> {
  if (initPromise) return initPromise;
  if (available) return true;

  initPromise = (async () => {
    if (await isRunning()) {
      available = true;
      console.log('[QuickFinder] Everything ready');
      return true;
    }

    console.log('[QuickFinder] Starting Everything...');
    const ok = await startBackground();
    available = ok;
    console.log('[QuickFinder] Everything:', ok ? 'ready' : 'unavailable');
    return ok;
  })();

  return initPromise;
}

export async function everythingSearch(query: string, maxResults = 20): Promise<EverythingResult[]> {
  if (!available) {
    await initEverything();
  }
  if (!available) return [];

  try {
    // CSV 格式输出，固定列：Size,Date Modified,Attributes,Filename
    const stdout = await esExec(['-n', String(maxResults), '-csv', '-size', '-date-modified', '-attributes', query]);
    return parseOutput(stdout);
  } catch {
    available = false;
    return [];
  }
}

export function isEverythingAvailable(): boolean {
  return available;
}
