import React, { useEffect } from 'react';
import { useChatStore, useActiveEntries, useActiveStreamingText } from '../stores/chat-store';
import { useAppStore } from '../stores/app-store';

const DEFAULT_LIMITS: Record<string, number> = {
  'deepseek-v4-pro': 1_000_000,
  'deepseek-v4-flash': 1_000_000,
  'deepseek-chat': 128_000,
  'deepseek-reasoner': 64_000,
  'claude-sonnet-4-6': 200_000,
  'claude-haiku-4-5': 200_000,
  'claude-opus-4-7': 200_000,
};

const SYSTEM_PROMPT_ESTIMATE = 800; // rough token count for system prompt + claude.md

/** Estimate tokens from mixed Chinese/English text */
function estimateTokens(text: string): number {
  let cjk = 0;
  let ascii = 0;
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    if (
      (code >= 0x4E00 && code <= 0x9FFF) || // CJK Unified
      (code >= 0x3400 && code <= 0x4DBF) || // CJK Ext-A
      (code >= 0x3000 && code <= 0x303F) || // CJK Symbols
      (code >= 0xFF00 && code <= 0xFFEF) || // Halfwidth/Fullwidth
      (code >= 0xAC00 && code <= 0xD7AF)    // Korean
    ) {
      cjk++;
    } else if (code > 127) {
      cjk++; // other non-ASCII treated like CJK
    } else {
      ascii++;
    }
  }
  return Math.round(cjk * 0.7 + ascii * 0.25);
}

export function ContextBar() {
  const entries = useActiveEntries();
  const streamingText = useActiveStreamingText();
  const currentModel = useAppStore(e => e.currentModel);
  const contextLimit = useAppStore(e => e.contextLimit);
  const setContextLimit = useAppStore(e => e.setContextLimit);

  // Load context limit from config on mount
  useEffect(() => {
    window.electronAPI?.getConfig().then((c: any) => {
      if (c.contextLimit && !contextLimit) {
        setContextLimit(c.contextLimit);
      }
    }).catch(() => {});
  }, []);

  let totalTokens = SYSTEM_PROMPT_ESTIMATE;
  for (const e of entries) {
    totalTokens += estimateTokens(e.content);
    if (e.toolResult) totalTokens += estimateTokens(e.toolResult);
    if (e.toolArgs) totalTokens += estimateTokens(e.toolArgs);
  }
  totalTokens += estimateTokens(streamingText);

  const limit = contextLimit || DEFAULT_LIMITS[currentModel] || 128_000;
  const pct = Math.min(100, Math.round((totalTokens / limit) * 100));

  const barColor = pct > 80 ? 'var(--error)' : pct > 60 ? 'var(--warning)' : 'var(--accent)';

  return (
    <div className="context-bar">
      <div className="context-bar-fill" style={{ width: `${pct}%`, background: barColor }} />
      <span className="context-bar-text">
        {totalTokens.toLocaleString()} / {(limit / 1000).toFixed(0)}K
      </span>
    </div>
  );
}
