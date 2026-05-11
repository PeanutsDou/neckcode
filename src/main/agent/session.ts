import { randomUUID } from 'crypto';
import type { Message, ToolCall, Attachment, ProviderUsage } from './types';
import { estimateMessageTokens } from './token-counter';

export interface UsageAnchor {
  usage: ProviderUsage;
  messageCount: number;
}

export class ChatSession {
  private messages: Message[] = [];
  private checkpoints: Message[][] = [];
  private usageAnchor: UsageAnchor | null = null;

  constructor(private systemPrompt?: string) {}

  addUserMessage(content: string, attachments?: Attachment[]): void {
    this.messages.push({
      role: 'user',
      content,
      attachments: attachments && attachments.length > 0 ? attachments : undefined,
    });
  }

  addAssistantStep(text: string, reasoningContent: string, toolCalls: ToolCall[]): void {
    this.messages.push({
      role: 'assistant',
      content: text,
      reasoningContent: reasoningContent || undefined,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    });
  }

  recordUsage(usage?: ProviderUsage): void {
    if (!usage) return;
    this.usageAnchor = {
      usage,
      messageCount: this.messages.length,
    };
  }

  addToolResult(toolCallId: string, content: string): void {
    this.messages.push({
      role: 'tool',
      toolCallId,
      content,
    });
  }

  toMessages(): Message[] {
    const result: Message[] = [];
    if (this.systemPrompt) {
      result.push({ role: 'system', content: this.systemPrompt });
    }
    result.push(...this.messages);
    return result;
  }

  createCheckpoint(): number {
    this.checkpoints.push([...this.messages]);
    return this.checkpoints.length - 1;
  }

  restore(index: number): void {
    if (index < this.checkpoints.length) {
      this.messages = [...this.checkpoints[index]];
      this.checkpoints = this.checkpoints.slice(0, index);
      if (this.usageAnchor && this.usageAnchor.messageCount > this.messages.length) {
        this.usageAnchor = null;
      }
    }
  }

  setMessages(messages: Message[]): void {
    this.messages = messages;
    this.checkpoints = [];
    this.usageAnchor = null;
  }

  getMessages(): Message[] {
    return JSON.parse(JSON.stringify(this.messages)) as Message[];
  }

  clear(): void {
    this.messages = [];
    this.checkpoints = [];
    this.usageAnchor = null;
  }

  getMessageCount(): number {
    return this.messages.length;
  }

  /** Remove the last user message and everything after it (assistant + tool messages) */
  removeLastUserTurn(): void {
    let lastUserIdx = -1;
    for (let i = this.messages.length - 1; i >= 0; i--) {
      if (this.messages[i].role === 'user') {
        lastUserIdx = i;
        break;
      }
    }
    if (lastUserIdx >= 0) {
      this.messages = this.messages.slice(0, lastUserIdx);
    }
    this.checkpoints = [];
    if (this.usageAnchor && this.usageAnchor.messageCount > this.messages.length) {
      this.usageAnchor = null;
    }
  }

  /** Estimate the token footprint of the complete provider message list. */
  estimateTokens(): number {
    return estimateMessageTokens(this.toMessages());
  }

  estimateTokensFromUsage(): { tokens: number; source: 'usage' | 'estimate' } {
    if (!this.usageAnchor) {
      return { tokens: this.estimateTokens(), source: 'estimate' };
    }
    const { usage, messageCount } = this.usageAnchor;
    const baseTokens = usage.inputTokens +
      usage.outputTokens +
      (usage.cacheCreationInputTokens || 0) +
      (usage.cacheReadInputTokens || 0);
    const newMessages = this.messages.slice(messageCount);
    return {
      tokens: baseTokens + estimateMessageTokens(newMessages),
      source: 'usage',
    };
  }

  getCompactionParts(keepRecentTurns: number): { earlyMessages: Message[]; recentMessages: Message[] } | null {
    let turnCount = 0;
    let cutoff = -1;
    for (let i = this.messages.length - 1; i >= 0; i--) {
      const m = this.messages[i];
      if (m.role === 'user') {
        turnCount++;
        if (turnCount === keepRecentTurns) {
          cutoff = i;
          break;
        }
      }
    }

    if (cutoff <= 0) return null;
    return {
      earlyMessages: this.messages.slice(0, cutoff),
      recentMessages: this.messages.slice(cutoff),
    };
  }

  replaceWithCompactSummary(summary: string, recentMessages: Message[]): void {
    this.messages = [
      {
        role: 'system',
        content: `[Compact boundary]\nPrior conversation was summarized to preserve context.\n\n${summary}`,
      },
      ...recentMessages,
    ];
    this.checkpoints = [];
    this.usageAnchor = null;
  }

}
