/**
 * Cost Tracking IPC — registers handlers and provides hook for agent turn completion.
 * This module avoids patching the massive ipc-handlers.ts directly.
 */
import { ipcMain } from 'electron';
import {
  addToTotalSessionCost,
  calculateUSDCost,
  getCostSummary,
  resetCostState,
  getCostStateSnapshot,
  restoreCostState,
  formatCost,
  formatTokens,
} from './cost-tracker';
import type { ProviderUsage } from './agent/types';

// ── Hook: call this from onComplete in runAgentTurnWithStreaming ──
// Usage: after step is available, call trackCostForTurn(modelName, step.usage)
export function trackCostForTurn(model: string, usage: ProviderUsage | undefined): void {
  if (!usage) return;
  const cost = calculateUSDCost(model, usage);
  addToTotalSessionCost(cost, usage, model);
}

export function setupCostIpc(): void {
  ipcMain.handle('cost:summary', () => getCostSummary());
  ipcMain.handle('cost:reset', () => { resetCostState(); return getCostSummary(); });
  ipcMain.handle('cost:snapshot', () => getCostStateSnapshot());
  ipcMain.handle('cost:restore', (_event, state) => { restoreCostState(state); });
  ipcMain.handle('cost:format', (_event, cost: number) => formatCost(cost));
  ipcMain.handle('cost:format-tokens', (_event, n: number) => formatTokens(n));
}
