import { ChatSession } from './session';
import type { ToolCall, ToolDefinition, RunStepResult, AgentCallbacks, Message, Attachment, ContextStatus } from './types';
import { ContextManager, type ContextManagerConfig } from './context-manager';

function partitionToolCalls(toolCalls: ToolCall[], toolDefs: ToolDefinition[]): { concurrent: boolean; calls: ToolCall[] }[] {
  const batches: { concurrent: boolean; calls: ToolCall[] }[] = [];
  for (const tc of toolCalls) {
    const def = toolDefs.find(d => d.function.name === tc.name);
    const concurrent = def?.readOnly === true;
    const last = batches.at(-1);
    if (concurrent && last?.concurrent) {
      last.calls.push(tc);
    } else {
      batches.push({ concurrent, calls: [tc] });
    }
  }
  return batches;
}

export interface Provider {
  runStep(params: {
    messages: Message[];
    tools: ToolDefinition[];
    model: string;
    onDelta?: (text: string) => void;
    onReasoning?: (text: string) => void;
    signal?: AbortSignal;
  }): Promise<RunStepResult>;
}

export interface ToolRegistry {
  getDefinitions(): ToolDefinition[];
  execute(toolCall: ToolCall): Promise<string>;
}

export class AgentRuntime {
  private session: ChatSession;
  private contextManager: ContextManager;

  constructor(
    private provider: Provider,
    private tools: ToolRegistry,
    private maxTurns: number,
    systemPrompt?: string,
    contextConfig: ContextManagerConfig | number = 1_000_000,
  ) {
    this.session = new ChatSession(systemPrompt);
    this.contextManager = new ContextManager(typeof contextConfig === 'number'
      ? { contextLimit: contextConfig, maxTokens: 20_000 }
      : contextConfig);
  }

  loadMessages(messages: Message[]): void {
    this.session.setMessages(messages);
  }

  getMessages(): Message[] {
    return this.session.getMessages();
  }

  getContextStatus(): ContextStatus {
    return this.contextManager.getStatus(this.session);
  }

  clear(): void {
    this.session.clear();
  }

  removeLastUserTurn(): void {
    this.session.removeLastUserTurn();
  }

  async runUserTurn(userMessage: string, attachments: Attachment[], callbacks: AgentCallbacks, signal?: AbortSignal): Promise<RunStepResult> {
    const checkpoint = this.session.createCheckpoint();
    this.session.addUserMessage(userMessage, attachments);

    try {
      for (let turn = 0; turn < this.maxTurns; turn++) {
        if (signal?.aborted) {
          throw new Error('Aborted');
        }

        await this.contextManager.compactIfNeeded(this.session, this.provider, callbacks.onContextUpdate, signal);
        callbacks.onModelRequest?.();
        const step = await this.provider.runStep({
          messages: this.session.toMessages(),
          tools: this.tools.getDefinitions(),
          model: 'default', // Will be overridden by the actual model in provider
          onDelta: callbacks.onDelta,
          onReasoning: callbacks.onReasoning,
          signal,
        });

        this.session.addAssistantStep(step.text, step.reasoningContent || '', step.toolCalls);
        this.contextManager.recordUsage(this.session, step.usage);
        callbacks.onContextUpdate?.(this.contextManager.getStatus(this.session));

        if (step.toolCalls.length === 0) {
          callbacks.onComplete?.(step);
          return step;
        }

        const batches = partitionToolCalls(step.toolCalls, this.tools.getDefinitions());
        for (const batch of batches) {
          if (batch.concurrent) {
            // Read-only tools: execute concurrently, preserve order
            const results = await Promise.all(
              batch.calls.map(async (tc) => {
                callbacks.onToolStart?.(tc);
                const result = await this.tools.execute(tc);
                return { tc, result };
              })
            );
            for (const { tc, result } of results) {
              this.session.addToolResult(tc.id, result);
              callbacks.onContextUpdate?.(this.contextManager.getStatus(this.session));
              callbacks.onToolResult?.(tc, result);
            }
          } else {
            // Write/non-readOnly tools: execute serially
            for (const tc of batch.calls) {
              callbacks.onToolStart?.(tc);
              const result = await this.tools.execute(tc);
              this.session.addToolResult(tc.id, result);
              callbacks.onContextUpdate?.(this.contextManager.getStatus(this.session));
              callbacks.onToolResult?.(tc, result);
            }
          }
        }
      }

      throw new Error(`Agent stopped after ${this.maxTurns} turns`);
    } catch (error) {
      if (!signal?.aborted) {
        // Unexpected error: roll back this turn
        this.session.restore(checkpoint);
        callbacks.onContextUpdate?.(this.contextManager.getStatus(this.session));
      }
      callbacks.onError?.(error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }
}
