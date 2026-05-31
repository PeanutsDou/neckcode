/**
 * Built-in Hooks — default hook registrations for cost tracking,
 * session memory, and other core features. These replace the
 * previously hardcoded logic in ipc-handlers.ts.
 *
 * This file is imported early in app startup (main/index.ts) to
 * register hooks before any agent runs.
 */

import { registerHook } from './registry';
import { addToTotalSessionCost, calculateUSDCost, getCostSummary } from '../cost-tracker';
import { shouldExtractMemory, extractSessionMemory } from '../session-memory';
import type { PostSamplingContext, PostToolUseContext, PreToolUseContext } from './types';

let hookIds: string[] = [];

export function registerBuiltinHooks(
  getWindow: () => import('electron').BrowserWindow | null,
): void {
  // ── Cost Tracking ──
  hookIds.push(
    registerHook('postSampling', async (ctx: PostSamplingContext) => {
      if (ctx.result.usage) {
        const win = getWindow();
        const model = 'default'; // The actual model is resolved inside the provider
        const cost = calculateUSDCost(model, ctx.result.usage);
        addToTotalSessionCost(cost, ctx.result.usage, model);
        win?.webContents.send('cost:updated', getCostSummary());
      }
    }, 10), // priority 10 = runs early
  );

  // ── Session Memory ──
  hookIds.push(
    registerHook('postSampling', async (ctx: PostSamplingContext) => {
      if (shouldExtractMemory(ctx.messages, ctx.workspaceRoot)) {
        const prov = ctx.getProvider();
        void extractSessionMemory(ctx.messages, ctx.workspaceRoot, () => prov).catch(() => {});
      }
    }, 90), // priority 90 = runs after cost tracking
  );

  // ── Tool use logging (example) ──
  hookIds.push(
    registerHook('postToolUse', async (ctx: PostToolUseContext) => {
      // Could add auto-lint, auto-format, or notification hooks here
    }, 100),
  );
}

/**
 * Remove all built-in hooks (e.g. on app shutdown or testing).
 */
export function unregisterBuiltinHooks(): void {
  const { removeHook } = require('./registry');
  for (const id of hookIds) {
    removeHook(id);
  }
  hookIds = [];
}
