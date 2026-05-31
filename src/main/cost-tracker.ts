/**
 * Cost Tracking — token statistics, USD cost calculation, per-model breakdown,
 * and session persistence. Adapted from Claude Code's cost-tracker.ts.
 */

import type { ProviderUsage } from './agent/types';

// ── Model pricing (USD per 1M tokens) ──
// Prices are for input / output. Cache rates default to 1/4 of input.
const MODEL_PRICING: Record<string, { input: number; output: number; cacheRead?: number }> = {
  // DeepSeek
  'deepseek-chat': { input: 0.27, output: 1.10 },
  'deepseek-reasoner': { input: 0.55, output: 2.19 },
  'deepseek-v4-flash': { input: 0.27, output: 1.10 },
  'deepseek-v4-pro': { input: 0.55, output: 2.19 },
  // Claude
  'claude-sonnet-4-20250514': { input: 3.00, output: 15.00, cacheRead: 0.30 },
  'claude-sonnet-4-6': { input: 3.00, output: 15.00, cacheRead: 0.30 },
  'claude-haiku-3.5': { input: 0.80, output: 4.00, cacheRead: 0.08 },
  'claude-haiku-4-5': { input: 0.80, output: 4.00, cacheRead: 0.08 },
  'claude-opus-4': { input: 15.00, output: 75.00, cacheRead: 1.50 },
  // GPT-4o
  'gpt-4o': { input: 2.50, output: 10.00 },
  'gpt-4o-mini': { input: 0.15, output: 0.60 },
};

// ── Per-model accumulated usage ──
export interface ModelUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
  webSearchRequests: number;
  costUSD: number;
}

// ── Global session state ──
interface CostState {
  totalCostUSD: number;
  totalAPIDuration: number;
  totalAPIDurationWithoutRetries: number;
  totalToolDuration: number;
  totalLinesAdded: number;
  totalLinesRemoved: number;
  modelUsage: Record<string, ModelUsage>;
}

const STATE: CostState = {
  totalCostUSD: 0,
  totalAPIDuration: 0,
  totalAPIDurationWithoutRetries: 0,
  totalToolDuration: 0,
  totalLinesAdded: 0,
  totalLinesRemoved: 0,
  modelUsage: {},
};

// ── Public getters ──

export function getTotalCostUSD(): number {
  return STATE.totalCostUSD;
}

export function getTotalInputTokens(): number {
  return Object.values(STATE.modelUsage).reduce((s, u) => s + u.inputTokens, 0);
}

export function getTotalOutputTokens(): number {
  return Object.values(STATE.modelUsage).reduce((s, u) => s + u.outputTokens, 0);
}

export function getTotalCacheReadInputTokens(): number {
  return Object.values(STATE.modelUsage).reduce((s, u) => s + u.cacheReadInputTokens, 0);
}

export function getTotalCacheCreationInputTokens(): number {
  return Object.values(STATE.modelUsage).reduce((s, u) => s + u.cacheCreationInputTokens, 0);
}

export function getTotalWebSearchRequests(): number {
  return Object.values(STATE.modelUsage).reduce((s, u) => s + u.webSearchRequests, 0);
}

export function getModelUsage(): Record<string, ModelUsage> {
  return STATE.modelUsage;
}

export function getUsageForModel(model: string): ModelUsage | undefined {
  return STATE.modelUsage[model];
}

// ── Cost calculation ──

/** Find pricing by fuzzy-matching model name against known pricing keys. */
function findPricing(model: string): { input: number; output: number; cacheRead: number } {
  const key = model.toLowerCase();
  // Exact match first
  if (MODEL_PRICING[key]) {
    const p = MODEL_PRICING[key];
    return { input: p.input, output: p.output, cacheRead: p.cacheRead ?? p.input * 0.25 };
  }
  // Prefix match
  for (const [k, p] of Object.entries(MODEL_PRICING)) {
    if (key.startsWith(k) || k.startsWith(key)) {
      return { input: p.input, output: p.output, cacheRead: p.cacheRead ?? p.input * 0.25 };
    }
  }
  // Default: DeepSeek pricing as fallback
  // For unknown models, log a conservative estimate
  console.warn(`[cost-tracker] Unknown model "${model}", using default pricing (DeepSeek rates)`);
  return { input: 0.27, output: 1.10, cacheRead: 0.07 };
}

export function calculateUSDCost(model: string, usage: ProviderUsage): number {
  const pricing = findPricing(model);
  const inputCost = (usage.inputTokens / 1_000_000) * pricing.input;
  const outputCost = (usage.outputTokens / 1_000_000) * pricing.output;
  const cacheReadCost = ((usage.cacheReadInputTokens ?? 0) / 1_000_000) * pricing.cacheRead;
  const cacheCreationCost = ((usage.cacheCreationInputTokens ?? 0) / 1_000_000) * (pricing.input * 0.25);
  return inputCost + outputCost + cacheReadCost + cacheCreationCost;
}

// ── Accumulation ──

export function addToTotalSessionCost(
  cost: number,
  usage: ProviderUsage,
  model: string,
): void {
  // Per-model
  let mu = STATE.modelUsage[model];
  if (!mu) {
    mu = {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadInputTokens: 0,
      cacheCreationInputTokens: 0,
      webSearchRequests: 0,
      costUSD: 0,
    };
    STATE.modelUsage[model] = mu;
  }

  mu.inputTokens += usage.inputTokens;
  mu.outputTokens += usage.outputTokens;
  mu.cacheReadInputTokens += usage.cacheReadInputTokens ?? 0;
  mu.cacheCreationInputTokens += usage.cacheCreationInputTokens ?? 0;
  mu.costUSD += cost;

  // Global
  STATE.totalCostUSD += cost;
}

// ── Lines changed ──

export function addToTotalLinesChanged(added: number, removed: number): void {
  STATE.totalLinesAdded += added;
  STATE.totalLinesRemoved += removed;
}

export function getTotalLinesAdded(): number {
  return STATE.totalLinesAdded;
}

export function getTotalLinesRemoved(): number {
  return STATE.totalLinesRemoved;
}

// ── Session persistence ──

export interface StoredCostState {
  totalCostUSD: number;
  totalLinesAdded: number;
  totalLinesRemoved: number;
  modelUsage: Record<string, { inputTokens: number; outputTokens: number; cacheReadInputTokens: number; cacheCreationInputTokens: number; webSearchRequests: number; costUSD: number }>;
}

export function getCostStateSnapshot(): StoredCostState {
  return {
    totalCostUSD: STATE.totalCostUSD,
    totalLinesAdded: STATE.totalLinesAdded,
    totalLinesRemoved: STATE.totalLinesRemoved,
    modelUsage: Object.fromEntries(
      Object.entries(STATE.modelUsage).map(([model, usage]) => [model, { ...usage }]),
    ),
  };
}

export function restoreCostState(state: StoredCostState | undefined): void {
  if (!state) return;
  STATE.totalCostUSD = state.totalCostUSD;
  STATE.totalLinesAdded = state.totalLinesAdded;
  STATE.totalLinesRemoved = state.totalLinesRemoved;
  STATE.modelUsage = {};
  for (const [model, usage] of Object.entries(state.modelUsage)) {
    STATE.modelUsage[model] = { ...usage };
  }
}

export function resetCostState(): void {
  STATE.totalCostUSD = 0;
  STATE.totalLinesAdded = 0;
  STATE.totalLinesRemoved = 0;
  STATE.totalAPIDuration = 0;
  STATE.totalAPIDurationWithoutRetries = 0;
  STATE.totalToolDuration = 0;
  STATE.modelUsage = {};
}

// ── Formatting ──

export function formatCost(cost: number): string {
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  if (cost < 1) return `$${cost.toFixed(3)}`;
  return `$${cost.toFixed(2)}`;
}

export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export interface CostSummary {
  totalCostUSD: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheReadTokens: number;
  totalCacheCreationTokens: number;
  totalWebSearchRequests: number;
  totalLinesAdded: number;
  totalLinesRemoved: number;
  modelUsage: Record<string, ModelUsage>;
}

export function getCostSummary(): CostSummary {
  return {
    totalCostUSD: getTotalCostUSD(),
    totalInputTokens: getTotalInputTokens(),
    totalOutputTokens: getTotalOutputTokens(),
    totalCacheReadTokens: getTotalCacheReadInputTokens(),
    totalCacheCreationTokens: getTotalCacheCreationInputTokens(),
    totalWebSearchRequests: getTotalWebSearchRequests(),
    totalLinesAdded: getTotalLinesAdded(),
    totalLinesRemoved: getTotalLinesRemoved(),
    modelUsage: getModelUsage(),
  };
}
