/**
 * Hooks System — event-driven extensibility for Neck Code.
 *
 * Usage:
 *   import { registerHook, triggerHooks } from './hooks';
 *
 *   // Register
 *   registerHook('postSampling', async (ctx) => {
 *     console.log('Turn completed with', ctx.result.toolCalls.length, 'tool calls');
 *   });
 *
 *   // Trigger (in ipc-handlers)
 *   await triggerHooks('postSampling', { sessionId, messages, result, agent, getProvider, workspaceRoot });
 */

export { registerHook, removeHook, triggerHooks, triggerHooksSync, hookCount, clearAllHooks } from './registry';
export type {
  HookEvent,
  HookHandler,
  HookContextMap,
  RegisteredHook,
  PreUserMessageContext,
  PostSamplingContext,
  PreToolUseContext,
  PostToolUseContext,
  SessionStartContext,
  SessionEndContext,
  ErrorContext,
} from './types';
