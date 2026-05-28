import { promises as fs } from 'fs';
import { join, resolve } from 'path';
import { APP_DATA_DIR_NAME, LEGACY_APP_DATA_DIR_NAME, legacyUserDataDir, userDataDir } from './app-paths';

export interface AgentMdResult {
  files: string[];
  content: string;
}

/**
 * Scan for AGENT.md files:
 * 1. Project-level: <workspace>/.neckcode/AGENT.md
 * 2. Global: ~/.neckcode/AGENT.md
 * Legacy app data files are still read for compatibility.
 */
export async function discoverAgentMd(startDir: string): Promise<AgentMdResult> {
  const files: string[] = [];
  const contents: string[] = [];

  const globalCandidates = [
    join(userDataDir(), 'AGENT.md'),
    join(legacyUserDataDir(), 'AGENT.md'),
  ];
  const projectCandidates = [
    join(startDir, APP_DATA_DIR_NAME, 'AGENT.md'),
    join(startDir, LEGACY_APP_DATA_DIR_NAME, 'AGENT.md'),
  ];

  for (const globalPath of globalCandidates) {
    try {
      const globalContent = await fs.readFile(globalPath, 'utf8');
      if (globalContent.trim() && !files.some(f => resolve(f) === resolve(globalPath))) {
        files.push(globalPath);
        contents.push(`# Global Instructions (${globalPath})\n${globalContent}`);
      }
    } catch {
      // No global AGENT.md at this path.
    }
  }

  for (const projectPath of projectCandidates) {
    if (files.some(f => resolve(f) === resolve(projectPath))) continue;
    try {
      const projectContent = await fs.readFile(projectPath, 'utf8');
      if (projectContent.trim()) {
        files.push(projectPath);
        contents.push(`# Project Instructions (${projectPath})\n${projectContent}`);
      }
    } catch {
      // No project-level AGENT.md at this path.
    }
  }

  return {
    files,
    content: contents.join('\n\n'),
  };
}
