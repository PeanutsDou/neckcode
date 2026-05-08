import { randomUUID } from 'crypto';
import type { Message, ToolCall, Attachment } from './types';

export class ChatSession {
  private messages: Message[] = [];
  private checkpoints: Message[][] = [];

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
    }
  }

  clear(): void {
    this.messages = [];
    this.checkpoints = [];
  }

  getMessageCount(): number {
    return this.messages.length;
  }

  /** Estimate total tokens (chars / 4) */
  estimateTokens(): number {
    let chars = 0;
    for (const m of this.messages) {
      chars += m.content.length;
      if (m.toolCalls) {
        for (const tc of m.toolCalls) chars += tc.argumentsText.length;
      }
    }
    return Math.round(chars / 4);
  }

  /** Compact: replace early user+assistant pairs with a system summary prompt */
  compact(keepRecentPairs: number): void {
    if (this.messages.length <= keepRecentPairs * 2 + 2) return;

    // Extract early messages to summarize
    const earlyMessages = this.messages.slice(0, -(keepRecentPairs * 2));
    const recentMessages = this.messages.slice(-(keepRecentPairs * 2));

    // Build a summary of early conversation
    const summaryParts: string[] = [];
    for (const m of earlyMessages) {
      if (m.role === 'user') {
        summaryParts.push(`User: ${m.content.slice(0, 200)}`);
      } else if (m.role === 'assistant') {
        summaryParts.push(`Assistant: ${m.content.slice(0, 200)}`);
      } else if (m.role === 'tool') {
        summaryParts.push(`[Tool result: ${m.content.slice(0, 100)}]`);
      }
    }

    const summary = `[Prior conversation summary - ${earlyMessages.length} messages compressed]\n${summaryParts.join('\n')}`;

    // Replace with summary + recent messages
    this.messages = [
      { role: 'system', content: summary },
      ...recentMessages,
    ];
  }
}

