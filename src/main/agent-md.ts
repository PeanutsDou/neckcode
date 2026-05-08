import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';

export interface AgentMdResult {
  files: string[];
  content: string;
}

/**
 * Scan for AGENT.md files:
 * 1. Project-level: <workspace>/.deepseekcode/AGENT.md
 * 2. Global: ~/.deepseekcode/AGENT.md
 */
export async function discoverAgentMd(startDir: string): Promise<AgentMdResult> {
  const files: string[] = [];
  const contents: string[] = [];

  // Global user AGENT.md
  const globalPath = join(homedir(), '.deepseekcode', 'AGENT.md');
  try {
    const globalContent = await fs.readFile(globalPath, 'utf8');
    if (globalContent.trim()) {
      files.push(globalPath);
      contents.push(`# Global Instructions (${globalPath})\n${globalContent}`);
    }
  } catch {
    // No global AGENT.md
  }

  // Project-level AGENT.md
  const projectPath = join(startDir, '.deepseekcode', 'AGENT.md');
  try {
    const projectContent = await fs.readFile(projectPath, 'utf8');
    if (projectContent.trim()) {
      files.push(projectPath);
      contents.push(`# Project Instructions (${projectPath})\n${projectContent}`);
    }
  } catch {
    // No project-level AGENT.md
  }

  return {
    files,
    content: contents.join('\n\n'),
  };
}
