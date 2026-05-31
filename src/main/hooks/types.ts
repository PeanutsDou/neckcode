/**
 * Hook Types — event context definitions for the hooks system.
 * Each hook event carries a specific context object.
 */

import type { AgentRuntime } from '../agent/runtime';
import type { Message, ProviderUsage, RunStepResult, ToolCall } from '../agent/types';

// ── Hook Events ──

export type HookEvent =
  | 'preUserMessage'
  | 'postSampling'
  | 'preToolUse'
  | 'postToolUse'
  | 'onSessionStart'
  | 'onSessionEnd'
  | 'onError';

// ── Hook Contexts ──

export interface PreUserMessageContext {
  sessionId: string;
  message: string;
  attachments: Array<{ type: string; data: string; mimeType: string }>;
  /** Hook can modify the message before sending */
  modifiedMessage?: string;
}

export interface PostSamplingContext {
  sessionId: string;
  messages: Message[];
  result: RunStepResult;
  agent: AgentRuntime;
  getProvider: () => import('../agent/runtime').Provider;
  workspaceRoot: string;
}

export interface PreToolUseContext {
  sessionId: string;
  toolCall: ToolCall;
  /** Set to true to block this tool call */
  blocked?: boolean;
  blockReason?: string;
}

export interface PostToolUseContext {
  sessionId: string;
  toolCall: ToolCall;
  result: string;
}

export interface SessionStartContext {
  sessionId: string;
  workspaceRoot: string;
}

export interface SessionEndContext {
  sessionId: string;
  workspaceRoot: string;
}

export interface ErrorContext {
  sessionId: string;
  error: Error;
  phase: string; // e.g. 'sampling', 'tool_execution'
}

// ── Union type for handler dispatch ──

export type HookContextMap = {
  preUserMessage: PreUserMessageContext;
  postSampling: PostSamplingContext;
  preToolUse: PreToolUseContext;
  postToolUse: PostToolUseContext;
  onSessionStart: SessionStartContext;
  onSessionEnd: SessionEndContext;
  onError: ErrorContext;
};

// ── Hook Handler ──

export type HookHandler<T extends HookEvent> = (context: HookContextMap[T]) => Promise<void> | void;

export interface RegisteredHook {
  event: HookEvent;
  handler: HookHandler<HookEvent>;
  priority: number;  // lower = runs first
  id: string;        // unique identifier for removal
}
