import type { ChatSession } from './session';
import type { ContextStatus, Message, ProviderUsage, RunStepResult, ToolDefinition } from './types';

export const AUTO_COMPACT_BUFFER_TOKENS = 13_000;
export const MAX_RESERVED_OUTPUT_TOKENS = 20_000;
export const BLOCKING_BUFFER_TOKENS = 3_000;
const KEEP_RECENT_TURN_CANDIDATES = [5, 3, 2, 1] as const;
const MAX_CONSECUTIVE_COMPACT_FAILURES = 3;

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
    return Math.max(1, this.effectiveWindow - AUTO_COMPACT_BUFFER_TOKENS);
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
      autoCompactBufferTokens: AUTO_COMPACT_BUFFER_TOKENS,
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

    if (this.consecutiveCompactFailures >= MAX_CONSECUTIVE_COMPACT_FAILURES) {
      if (status.currentTokens >= this.blockingThreshold) {
        throw new ContextLimitError('Context is near the model limit and automatic compaction is disabled after repeated failures.');
      }
      return status;
    }

    const parts = this.getAdaptiveCompactionParts(session);
    if (!parts) {
      if (status.currentTokens >= this.blockingThreshold) {
        throw new ContextLimitError('Context is near the model limit but there is not enough older conversation to compact.');
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

  private async generateSummary(messages: Message[], runner: CompactRunner, signal?: AbortSignal): Promise<string> {
    const response = await runner.runStep({
      messages: [
        {
          role: 'system',
          content: 'You summarize coding-agent conversations for context compaction. Preserve user goals, decisions, constraints, file paths, tool results, unresolved tasks, and recent state. Be concise but complete.',
        },
        {
          role: 'user',
          content: `Summarize the following prior conversation for continuation. Return only the summary.\n\n${JSON.stringify(messages)}`,
        },
      ],
      tools: [],
      model: 'default',
      signal,
    });
    const summary = response.text.trim();
    if (!summary) throw new Error('Compaction produced an empty summary.');
    return summary;
  }

  private getAdaptiveCompactionParts(session: ChatSession): { earlyMessages: Message[]; recentMessages: Message[]; keepRecentTurns: number } | null {
    for (const keepRecentTurns of KEEP_RECENT_TURN_CANDIDATES) {
      const parts = session.getCompactionParts(keepRecentTurns);
      if (parts) return { ...parts, keepRecentTurns };
    }
    return null;
  }
}
