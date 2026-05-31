/**
 * Session Memory — automatically maintains a SESSION_MEMORY.md file
 * with key information extracted from the conversation.
 * Adapted from Claude Code's src/services/SessionMemory/.
 */

import { promises as fs } from 'fs';
import { join } from 'path';
import type { Message, ProviderUsage } from './agent/types';
import type { Provider } from './agent/runtime';

// ── State ──
const lastExtractionMessageCount = new Map<string, number>();
const extractionInProgress = new Set<string>();
let cachedMemoryContent: string | null = null;
let cachedWorkspaceRoot = '';
let cachedProjectMemoryContent: string | null = null;
let cachedUserPreferenceContent: string | null = null;

// ── Thresholds ──
const MESSAGE_COUNT_THRESHOLD = 8;   // min messages between extractions
const TOKEN_THRESHOLD = 8000;         // min estimated tokens between extractions

// ── Path ──
export function getSessionMemoryPath(workspaceRoot: string): string {
  return join(workspaceRoot, '.neckcode', 'SESSION_MEMORY.md');
}

export function getProjectMemoryPath(workspaceRoot: string): string {
  return join(workspaceRoot, '.neckcode', 'PROJECT_MEMORY.md');
}

export function getUserPreferenceMemoryPath(workspaceRoot: string): string {
  return join(workspaceRoot, '.neckcode', 'USER_PREFERENCES.md');
}

// ── Public API ──

export function shouldExtractMemory(messages: Message[], workspaceRoot = 'default'): boolean {
  const key = workspaceRoot || 'default';
  if (extractionInProgress.has(key)) return false;

  const lastCount = lastExtractionMessageCount.get(key) || 0;
  if (messages.length - lastCount < MESSAGE_COUNT_THRESHOLD) return false;

  // Rough token estimate: 4 chars ≈ 1 token
  let estimatedTokens = 0;
  for (const msg of messages) {
    estimatedTokens += (msg.content?.length || 0) / 4;
  }
  if (estimatedTokens < TOKEN_THRESHOLD && lastCount > 0) return false;

  return true;
}

export async function extractSessionMemory(
  messages: Message[],
  workspaceRoot: string,
  getProvider: () => Provider,
): Promise<void> {
  const key = workspaceRoot || 'default';
  if (extractionInProgress.has(key)) return;
  extractionInProgress.add(key);

  try {
    const memoryPath = getSessionMemoryPath(workspaceRoot);

    // Ensure directory
    await fs.mkdir(join(workspaceRoot, '.neckcode'), { recursive: true });

    // Read existing memory
    let existing = '';
    try {
      existing = await fs.readFile(memoryPath, 'utf8');
    } catch {
      // File doesn't exist yet — start fresh
      existing = '# Session Memory\n\n_Auto-generated summary of key information from this conversation._\n';
    }

    // Build extraction prompt
    const conversationSummary = buildConversationSummary(messages);
    const prompt = `You are maintaining a session memory file. Below is the current memory file followed by the latest conversation. Update the memory file to include ALL important information — preferences, decisions, project structure, key files, TODO items, user notes, etc. Keep it concise but comprehensive.

## Current Memory File
${existing}

## Latest Conversation
${conversationSummary}

## Instructions
1. Preserve all existing memory that is still relevant
2. Add NEW important information from the latest conversation
3. Remove outdated or contradicted information
4. Keep the format as markdown with clear sections
5. Output ONLY the updated memory file content, nothing else`;

    // Call the provider (lightweight, non-streaming)
    const provider = getProvider();
    const result = await provider.runStep({
      messages: [
        { role: 'user', content: prompt },
      ],
      tools: [],
      model: 'default',
    });

    const updated = result.text.trim();
    if (updated.length > 100) {
      await fs.writeFile(memoryPath, updated, 'utf8');
      cachedMemoryContent = updated;
      cachedWorkspaceRoot = workspaceRoot;
    }

    lastExtractionMessageCount.set(key, messages.length);
  } catch (err) {
    // Non-critical — silently ignore failures
    console.error('[session-memory] Extraction failed:', err);
  } finally {
    extractionInProgress.delete(key);
  }
}

export function getCachedSessionMemoryContent(workspaceRoot: string): string {
  return cachedMemoryContent !== null && cachedWorkspaceRoot === workspaceRoot
    ? cachedMemoryContent
    : '';
}

export async function preloadSessionMemoryContent(workspaceRoot: string): Promise<string> {
  return getSessionMemoryContent(workspaceRoot);
}

export function getCachedLayeredMemoryContent(workspaceRoot: string): {
  session: string;
  project: string;
  user: string;
} {
  if (cachedWorkspaceRoot !== workspaceRoot) {
    return { session: '', project: '', user: '' };
  }
  return {
    session: cachedMemoryContent || '',
    project: cachedProjectMemoryContent || '',
    user: cachedUserPreferenceContent || '',
  };
}

export async function preloadLayeredMemoryContent(workspaceRoot: string): Promise<{
  session: string;
  project: string;
  user: string;
}> {
  return getLayeredMemoryContent(workspaceRoot);
}

export async function getLayeredMemoryContent(workspaceRoot: string): Promise<{
  session: string;
  project: string;
  user: string;
}> {
  const [session, project, user] = await Promise.all([
    getSessionMemoryContent(workspaceRoot),
    readOptionalFile(getProjectMemoryPath(workspaceRoot)),
    readOptionalFile(getUserPreferenceMemoryPath(workspaceRoot)),
  ]);
  cachedWorkspaceRoot = workspaceRoot;
  cachedProjectMemoryContent = project;
  cachedUserPreferenceContent = user;
  return { session, project, user };
}

export async function getSessionMemoryContent(workspaceRoot: string): Promise<string> {
  if (cachedMemoryContent !== null && cachedWorkspaceRoot === workspaceRoot) {
    return cachedMemoryContent;
  }

  try {
    const memoryPath = getSessionMemoryPath(workspaceRoot);
    const content = await fs.readFile(memoryPath, 'utf8');
    cachedMemoryContent = content;
    cachedWorkspaceRoot = workspaceRoot;
    return content;
  } catch {
    return '';
  }
}

export function resetSessionMemory(): void {
  lastExtractionMessageCount.clear();
  extractionInProgress.clear();
  cachedMemoryContent = null;
  cachedProjectMemoryContent = null;
  cachedUserPreferenceContent = null;
  cachedWorkspaceRoot = '';
}

async function readOptionalFile(path: string): Promise<string> {
  try {
    return await fs.readFile(path, 'utf8');
  } catch {
    return '';
  }
}

// ── Helpers ──

function buildConversationSummary(messages: Message[]): string {
  const recent = messages.slice(-30); // Last 30 messages max
  const lines: string[] = [];

  for (const msg of recent) {
    const role = msg.role;
    const preview = (msg.content || '').slice(0, 500);
    if (role === 'user') {
      lines.push(`**User**: ${preview}`);
    } else if (role === 'assistant') {
      const text = preview.slice(0, 300);
      const toolNames = msg.toolCalls?.map(tc => tc.name).join(', ') || '';
      lines.push(`**Assistant**${toolNames ? ` [tools: ${toolNames}]` : ''}: ${text}`);
    } else if (role === 'tool') {
      // Skip tool results — too verbose
      continue;
    }
  }

  return lines.join('\n\n');
}
