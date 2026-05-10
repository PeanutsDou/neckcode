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

  /** Estimate total tokens with CJK-aware weighting */
  estimateTokens(): number {
    let total = this.systemPrompt ? this._tokenEstimate(this.systemPrompt) : 0;
    for (const m of this.messages) {
      total += this._tokenEstimate(m.content);
      if (m.attachments) {
        // Image token usage is provider-specific; reserve a conservative budget
        // so image-heavy turns can still trigger compaction before API failure.
        total += m.attachments.length * 1024;
      }
      if (m.toolCalls) {
        for (const tc of m.toolCalls) total += this._tokenEstimate(tc.argumentsText);
      }
    }
    return total;
  }

  private _tokenEstimate(text: string): number {
    let cjk = 0;
    let ascii = 0;
    for (const ch of text) {
      const code = ch.charCodeAt(0);
      if (
        (code >= 0x4E00 && code <= 0x9FFF) ||
        (code >= 0x3400 && code <= 0x4DBF) ||
        (code >= 0x3000 && code <= 0x303F) ||
        (code >= 0xFF00 && code <= 0xFFEF) ||
        (code >= 0xAC00 && code <= 0xD7AF) ||
        code > 127
      ) {
        cjk++;
      } else {
        ascii++;
      }
    }
    return Math.round(cjk * 0.7 + ascii * 0.25);
  }

  /** Compact: replace early messages with a system summary, keeping recent turn groups intact */
  compact(keepRecentTurns: number, maxSummaryChars: number = 12000): void {
    // Count turns from the end: a turn = user + assistant + any following tool messages
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

    if (cutoff <= 0) return;

    const earlyMessages = this.messages.slice(0, cutoff);
    const recentMessages = this.messages.slice(cutoff);

    const summaryParts: string[] = [];
    let summaryChars = 0;
    const pushSummaryPart = (text: string) => {
      if (summaryChars >= maxSummaryChars) return;
      const remaining = maxSummaryChars - summaryChars;
      const clipped = text.length > remaining ? `${text.slice(0, Math.max(0, remaining - 3))}...` : text;
      summaryParts.push(clipped);
      summaryChars += clipped.length + 1;
    };

    for (const m of earlyMessages) {
      if (m.role === 'system') {
        pushSummaryPart(m.content);
      } else if (m.role === 'user') {
        pushSummaryPart(`User: ${m.content.slice(0, 1000)}`);
      } else if (m.role === 'assistant') {
        const toolNames = m.toolCalls?.map(tc => tc.name).filter(Boolean).join(', ');
        pushSummaryPart(`Assistant${toolNames ? ` (tool calls: ${toolNames})` : ''}: ${m.content.slice(0, 1000)}`);
        for (const tc of m.toolCalls || []) {
          pushSummaryPart(`Tool call ${tc.name} args: ${tc.argumentsText.slice(0, 800)}`);
        }
      } else if (m.role === 'tool') {
        pushSummaryPart(`Tool result ${m.toolCallId || 'unknown'}: ${m.content.slice(0, 800)}`);
      }
    }

    const summary = `[Prior conversation summary - ${earlyMessages.length} messages compressed]\n${summaryParts.join('\n')}`;
    this.messages = [
      { role: 'system', content: summary },
      ...recentMessages,
    ];
  }
}
