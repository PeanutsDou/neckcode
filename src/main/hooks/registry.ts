/**
 * Hook Registry — registers, removes, and triggers hooks.
 * All hooks execute in registration order (by priority, then insertion order).
 * A hook that throws is logged and skipped; subsequent hooks still run.
 */

import { randomUUID } from 'crypto';
import type { HookEvent, HookHandler, HookContextMap, RegisteredHook } from './types';

const hooks: RegisteredHook[] = [];

/**
 * Register a hook handler for a specific lifecycle event.
 * @returns An id that can be used with `removeHook` to unregister.
 */
export function registerHook<T extends HookEvent>(
  event: T,
  handler: HookHandler<T>,
  priority = 50,
): string {
  const id = randomUUID();
  hooks.push({ event, handler: handler as HookHandler<HookEvent>, priority, id });
  // Keep sorted by priority, then insertion order (stable)
  hooks.sort((a, b) => a.priority - b.priority);
  return id;
}

/**
 * Remove a previously registered hook by id.
 */
export function removeHook(id: string): boolean {
  const idx = hooks.findIndex(h => h.id === id);
  if (idx === -1) return false;
  hooks.splice(idx, 1);
  return true;
}

/**
 * Trigger all registered hooks for a given event.
 * Each hook runs sequentially. If one throws, the error is logged
 * and subsequent hooks continue to run (non-fatal).
 */
export async function triggerHooks<T extends HookEvent>(
  event: T,
  context: HookContextMap[T],
): Promise<void> {
  const candidates = hooks.filter(h => h.event === event);
  if (candidates.length === 0) return;

  for (const hook of candidates) {
    try {
      await hook.handler(context);
    } catch (err) {
      console.error(`[hooks] Error in hook "${hook.id}" for event "${event}":`, err);
      // Non-fatal: continue with remaining hooks
    }
  }
}

/**
 * Trigger hooks synchronously (for non-async handlers or fire-and-forget).
 */
export function triggerHooksSync<T extends HookEvent>(
  event: T,
  context: HookContextMap[T],
): void {
  void triggerHooks(event, context);
}

/**
 * Return the number of registered hooks (mainly for tests/debug).
 */
export function hookCount(): number {
  return hooks.length;
}

/**
 * Remove all registered hooks (mainly for tests).
 */
export function clearAllHooks(): void {
  hooks.length = 0;
}
