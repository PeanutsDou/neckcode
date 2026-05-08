import { ChatSession } from './session';
import type { ToolCall, ToolDefinition, RunStepResult, AgentCallbacks, Message, Attachment } from './types';

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

  async runUserTurn(userMessage: string, attachments: Attachment[], callbacks: AgentCallbacks, signal?: AbortSignal): Promise<RunStepResult> {
    const checkpoint = this.session.createCheckpoint();
    this.session.addUserMessage(userMessage, attachments);

    // Auto-compact if exceeding 80% of context limit (1M for deepseek, 200K for claude)
    const estimatedTokens = this.session.estimateTokens();
    const contextLimit = 1_000_000; // Conservative default
    if (estimatedTokens > contextLimit * 0.8) {
      this.session.compact(5); // Keep last 5 pairs
      callbacks.onDelta?.('[Context compacted] ');
    }

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
