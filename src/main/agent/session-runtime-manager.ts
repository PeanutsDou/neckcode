import type { AgentRuntime } from './runtime';
import type { QueuedUserMessage } from './types';

export class SessionRuntimeManager {
  readonly agents = new Map<string, AgentRuntime>();
  readonly abortControllers = new Map<string, AbortController>();
  readonly runningTurns = new Map<string, Promise<unknown>>();
  readonly queuedTurns = new Map<string, QueuedUserMessage[]>();
  readonly models = new Map<string, string>();

  abort(sessionId: string): void {
    this.abortControllers.get(sessionId)?.abort();
    this.abortControllers.delete(sessionId);
  }

  clearQueue(sessionId: string): void {
    this.queuedTurns.delete(sessionId);
  }

  clearSession(sessionId: string): void {
    this.abort(sessionId);
    this.agents.delete(sessionId);
    this.models.delete(sessionId);
    this.clearQueue(sessionId);
  }
}
