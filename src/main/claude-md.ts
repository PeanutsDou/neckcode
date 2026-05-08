import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';

export interface ClaudeMdResult {
  files: string[];
  content: string;
}

/**
 * Scan directory tree upward from startDir for CLAUDE.md files.
 * Also checks user's global ~/.claude/CLAUDE.md.
 */
export async function discoverClaudeMd(startDir: string): Promise<ClaudeMdResult> {
  const files: string[] = [];
  const contents: string[] = [];

  // Global user CLAUDE.md
  const globalPath = join(homedir(), '.claude', 'CLAUDE.md');
  try {
    const globalContent = await fs.readFile(globalPath, 'utf8');
    if (globalContent.trim()) {
      files.push(globalPath);
      contents.push(`# Global Instructions (${globalPath})\n${globalContent}`);
    }
  } catch {
    // No global CLAUDE.md
  }

  // Walk up from workspace root to find project CLAUDE.md files
  let current = startDir;
  const root = dirname(current); // drive root or /

  while (current.length >= root.length) {
    try {
      const candidate = join(current, 'CLAUDE.md');
      const content = await fs.readFile(candidate, 'utf8');
      if (content.trim()) {
        files.push(candidate);
        contents.push(`# Project Instructions (${candidate})\n${content}`);
      }
    } catch {
      // No CLAUDE.md in this directory
    }
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }

  return {
    files,
    content: contents.join('\n\n'),
  };
}
