import { randomUUID } from 'crypto';
import type { Message, ToolCall } from './types';

export class ChatSession {
  private messages: Message[] = [];
  private checkpoints: Message[][] = [];

  constructor(private systemPrompt?: string) {}

  addUserMessage(content: string): void {
    this.messages.push({ role: 'user', content });
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
}

