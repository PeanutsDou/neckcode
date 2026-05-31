import type { ChatSession } from './session';
import type { ContextStatus, Message, ProviderUsage, RunStepResult, ToolDefinition } from './types';

export const AUTO_COMPACT_THRESHOLD_RATIO = 0.6;
export const MAX_RESERVED_OUTPUT_TOKENS = 20_000;
export const BLOCKING_BUFFER_TOKENS = 3_000;
const KEEP_RECENT_TURN_CANDIDATES = [5, 3, 2, 1] as const;
const MAX_CONSECUTIVE_COMPACT_FAILURES = 3;
const MIN_MESSAGES_TO_COMPACT = 6;

export interface ContextManagerConfig {
  contextLimit: number;
  maxTokens: number;
}

export interface CompactRunner {
  runStep(params: {
    messages: Message[];
    tools: ToolDefinition[];
    model: string;
    signal?: AbortSignal;
  }): Promise<RunStepResult>;
}

export class ContextLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ContextLimitError';
  }
}

export function getAutoCompactThreshold(effectiveWindow: number): number {
  return Math.max(1, Math.floor(effectiveWindow * AUTO_COMPACT_THRESHOLD_RATIO));
}

/** Compact prompt — adapted from Claude Code's structured 9-section format. */
function buildCompactSystemPrompt(): string {
  return [
    'CRITICAL: Respond with TEXT ONLY. Do NOT call any tools.',
    'Do NOT use Read, Bash, Grep, Glob, Edit, Write, or ANY other tool.',
    'You already have all the context you need in the conversation.',
    'Your entire response must be plain text: an <analysis> block followed by a summary.',
    '',
    'Your task is to create a detailed summary of the prior conversation. This summary will replace the original messages to save context space while preserving all essential information for continuing development work.',
    '',
    'Before providing your final summary, wrap your analysis in <analysis> tags to organize your thoughts. In your analysis:',
    '',
    '1. Chronologically analyze each section of the conversation. For each section thoroughly identify:',
    '   - The user\'s explicit requests and intents',
    '   - Your approach to addressing the user\'s requests',
    '   - Key decisions, technical concepts and code patterns',
    '   - Specific file names, full code snippets, function signatures, and file edits',
    '   - Errors encountered and how they were fixed',
    '   - User feedback, especially corrections or direction changes',
    '2. Double-check for technical accuracy and completeness.',
    '',
    'Your summary MUST include these numbered sections:',
    '',
    '1. Primary Request and Intent: All of the user\'s explicit requests in detail.',
    '2. Key Technical Concepts: Technologies, frameworks, libraries, and patterns discussed.',
    '3. Files and Code Sections: Every file examined or modified, with key code snippets and why each file matters.',
    '4. Errors and Fixes: Every error encountered, how it was fixed, and any user feedback on the fix.',
    '5. Problem Solving: What was solved and what is still being investigated.',
    '6. All User Messages: Every non-tool-result user message, verbatim when possible. These capture changing intent.',
    '7. Pending Tasks: Tasks explicitly requested but not yet completed.',
    '8. Current Work: Precisely what was being worked on immediately before this summary, including file names and code.',
    '9. Optional Next Step: The concrete next action, directly in line with the user\'s most recent request. If the last task was concluded, only list next steps explicitly requested by the user.',
    '',
    'Output format:',
    '<analysis>',
    '[Your thought process covering all required elements]',
    '</analysis>',
    '',
    'Summary:',
    '1. Primary Request and Intent:',
    '   ...',
    '2. Key Technical Concepts:',
    '   ...',
    '...',
    '',
    'Be thorough and precise. Every lost detail will be lost permanently.',
    '',
    'REMINDER: Do NOT call any tools. Respond with plain text only.',
  ].join('\n');
}

/** Format messages as readable text instead of raw JSON — saves tokens and improves summary quality. */
function formatMessagesForCompaction(messages: Message[]): string {
  const lines: string[] = [];
  for (const m of messages) {
    switch (m.role) {
      case 'user':
        lines.push(`[USER] ${m.content}`);
        break;
      case 'assistant': {
        if (m.content) lines.push(`[ASSISTANT] ${m.content}`);
        if (m.toolCalls?.length) {
          for (const tc of m.toolCalls) {
            lines.push(`  → tool_call: ${tc.name}(${tc.argumentsText})`);
          }
        }
        break;
      }
      case 'tool':
        lines.push(`  ← tool_result[${m.toolCallId}]: ${truncateText(m.content, 2000)}`);
        break;
    }
  }
  return lines.join('\n');
}

function truncateText(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + '\n... [truncated for compaction]';
}

function stripAnalysisBlock(summary: string): string {
  return summary.replace(/<analysis>[\s\S]*?<\/analysis>/gi, '').trim();
}

export class ContextManager {
  private lastCompactAt: number | null = null;
  private compactCount = 0;
  private compactError: string | null = null;
  private consecutiveCompactFailures = 0;
  private compacting = false;

  constructor(private readonly config: ContextManagerConfig) {}

  get reservedOutputTokens(): number {
    return Math.min(Math.max(0, this.config.maxTokens || 0), MAX_RESERVED_OUTPUT_TOKENS);
  }

  get effectiveWindow(): number {
    return Math.max(1, this.config.contextLimit - this.reservedOutputTokens);
  }

  get autoCompactThreshold(): number {
    return getAutoCompactThreshold(this.effectiveWindow);
  }

  get autoCompactBufferTokens(): number {
    return Math.max(0, this.effectiveWindow - this.autoCompactThreshold);
  }

  get blockingThreshold(): number {
    return Math.max(1, this.effectiveWindow - BLOCKING_BUFFER_TOKENS);
  }

  getStatus(session: ChatSession, overrides: Partial<ContextStatus> = {}): ContextStatus {
    const measured = session.estimateTokensFromUsage();
    const currentTokens = measured.tokens;
    const freeTokens = Math.max(0, this.effectiveWindow - currentTokens);
    return {
      currentTokens,
      estimatedTokens: currentTokens,
      contextLimit: this.config.contextLimit,
      effectiveWindow: this.effectiveWindow,
      reservedOutputTokens: this.reservedOutputTokens,
      autoCompactThreshold: this.autoCompactThreshold,
      autoCompactBufferTokens: this.autoCompactBufferTokens,
      blockingThreshold: this.blockingThreshold,
      freeTokens,
      percentUsed: Math.min(100, Math.round((currentTokens / this.effectiveWindow) * 100)),
      willAutoCompact: currentTokens >= this.autoCompactThreshold,
      source: measured.source,
      compacting: this.compacting,
      compacted: false,
      lastCompactAt: this.lastCompactAt,
      compactCount: this.compactCount,
      compactError: this.compactError,
      consecutiveCompactFailures: this.consecutiveCompactFailures,
      ...overrides,
    };
  }

  recordUsage(session: ChatSession, usage?: ProviderUsage): void {
    session.recordUsage(usage);
  }

  async compactIfNeeded(
    session: ChatSession,
    runner: CompactRunner,
    onStatus?: (status: ContextStatus) => void,
    signal?: AbortSignal,
  ): Promise<ContextStatus> {
    let status = this.getStatus(session);
    onStatus?.(status);
    if (!status.willAutoCompact) return status;

    // Circuit breaker: stop after too many consecutive failures
    if (this.consecutiveCompactFailures >= MAX_CONSECUTIVE_COMPACT_FAILURES) {
      if (status.currentTokens >= this.blockingThreshold) {
        throw new ContextLimitError(
          'Context is near the model limit and automatic compaction is disabled after repeated failures. ' +
          'Use /compact to try manually, or start a new session.',
        );
      }
      return status;
    }

    // Pre-check: don't bother compacting trivially short conversations
    if (session.getMessageCount() < MIN_MESSAGES_TO_COMPACT) {
      return status;
    }

    const parts = this.getAdaptiveCompactionParts(session);
    if (!parts) {
      if (status.currentTokens >= this.blockingThreshold) {
        throw new ContextLimitError(
          'Context is near the model limit but there is not enough older conversation to compact. ' +
          'Start a new session to continue.',
        );
      }
      return status;
    }

    this.compacting = true;
    onStatus?.(this.getStatus(session, { compacting: true }));
    try {
      const summary = await this.generateSummary(parts.earlyMessages, runner, signal);
      session.replaceWithCompactSummary(summary, parts.recentMessages);
      this.lastCompactAt = Date.now();
      this.compactCount++;
      this.compactError = null;
      this.consecutiveCompactFailures = 0;

      status = this.getStatus(session, { compacted: true, compacting: false });
      onStatus?.(status);

      if (status.currentTokens >= this.blockingThreshold) {
        throw new ContextLimitError('Context is still near the model limit after compaction.');
      }
      return status;
    } catch (error) {
      this.consecutiveCompactFailures++;
      this.compactError = error instanceof Error ? error.message : String(error);
      status = this.getStatus(session, { compacting: false, compactError: this.compactError });
      onStatus?.(status);
      if (status.currentTokens >= this.blockingThreshold) {
        throw error instanceof ContextLimitError
          ? error
          : new ContextLimitError(`Automatic compaction failed: ${this.compactError}`);
      }
      return status;
    } finally {
      this.compacting = false;
    }
  }

  private async generateSummary(
    messages: Message[],
    runner: CompactRunner,
    signal?: AbortSignal,
  ): Promise<string> {
    const conversationText = formatMessagesForCompaction(messages);

    const response = await runner.runStep({
      messages: [
        { role: 'system', content: buildCompactSystemPrompt() },
        { role: 'user', content: `Here is the conversation to summarize:\n\n${conversationText}` },
      ],
      tools: [],
      model: 'default',
      signal,
    });

    let summary = response.text.trim();
    if (!summary) throw new Error('Compaction produced an empty summary.');

    // Strip <analysis> block — it was a drafting scratchpad, not part of the final summary
    summary = stripAnalysisBlock(summary);
    if (!summary) throw new Error('Compaction summary was empty after stripping analysis block.');

    return summary;
  }

  private getAdaptiveCompactionParts(session: ChatSession): {
    earlyMessages: Message[];
    recentMessages: Message[];
    keepRecentTurns: number;
  } | null {
    for (const keepRecentTurns of KEEP_RECENT_TURN_CANDIDATES) {
      const parts = session.getCompactionParts(keepRecentTurns);
      if (parts) return { ...parts, keepRecentTurns };
    }
    return null;
  }
}
