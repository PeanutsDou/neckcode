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

  setMessages(messages: Message[]): void {
    this.messages = messages;
    this.checkpoints = [];
  }

  getMessages(): Message[] {
    return JSON.parse(JSON.stringify(this.messages)) as Message[];
  }

  clear(): void {
    this.messages = [];
    this.checkpoints = [];
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

  /** Compact: replace early messages with a system summary, keeping recent turn groups intact */
  compact(keepRecentTurns: number): void {
    // Count turns from the end: a turn = user + assistant + any following tool messages
    let turnCount = 0;
    let cutoff = this.messages.length;
    for (let i = this.messages.length - 1; i >= 0; i--) {
      const m = this.messages[i];
      if (m.role === 'user') {
        turnCount++;
        if (turnCount > keepRecentTurns) {
          cutoff = i;
          break;
        }
      }
    }

    if (cutoff <= 0) return;

    const earlyMessages = this.messages.slice(0, cutoff);
    const recentMessages = this.messages.slice(cutoff);

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
    this.messages = [
      { role: 'system', content: summary },
      ...recentMessages,
    ];
  }
}
