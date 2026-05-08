import { ChatSession } from './session';
import type { ToolCall, ToolDefinition, RunStepResult, AgentCallbacks, Message } from './types';

export interface Provider {
  runStep(params: {
    messages: Message[];
    tools: ToolDefinition[];
    model: string;
    onDelta?: (text: string) => void;
    signal?: AbortSignal;
  }): Promise<RunStepResult>;
}

export interface ToolRegistry {
  getDefinitions(): ToolDefinition[];
  execute(toolCall: ToolCall): Promise<string>;
}

export class AgentRuntime {
  private session: ChatSession;

  constructor(
    private provider: Provider,
    private tools: ToolRegistry,
    private maxTurns: number,
    systemPrompt?: string,
  ) {
    this.session = new ChatSession(systemPrompt);
  }

  clear(): void {
    this.session.clear();
  }

  async runUserTurn(userMessage: string, callbacks: AgentCallbacks, signal?: AbortSignal): Promise<RunStepResult> {
    const checkpoint = this.session.createCheckpoint();
    this.session.addUserMessage(userMessage);

    try {
      for (let turn = 0; turn < this.maxTurns; turn++) {
        if (signal?.aborted) {
          throw new Error('Aborted');
        }

        const step = await this.provider.runStep({
          messages: this.session.toMessages(),
          tools: this.tools.getDefinitions(),
          model: 'default', // Will be overridden by the actual model in provider
          onDelta: callbacks.onDelta,
          signal,
        });

        this.session.addAssistantStep(step.text, step.reasoningContent || '', step.toolCalls);

        if (step.toolCalls.length === 0) {
          callbacks.onComplete?.(step);
          return step;
        }

        for (const toolCall of step.toolCalls) {
          callbacks.onToolStart?.(toolCall);
          const result = await this.tools.execute(toolCall);
          this.session.addToolResult(toolCall.id, result);
          callbacks.onToolResult?.(toolCall, result);
        }
      }

      throw new Error(`Agent stopped after ${this.maxTurns} turns`);
    } catch (error) {
      this.session.restore(checkpoint);
      callbacks.onError?.(error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }
}
