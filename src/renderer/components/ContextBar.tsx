import React from 'react';
import { useChatStore } from '../stores/chat-store';
import { useAppStore } from '../stores/app-store';

const MODEL_LIMITS: Record<string, number> = {
  'deepseek-v4-pro': 128000,
  'deepseek-v4-flash': 128000,
  'claude-sonnet-4-6': 200000,
  'claude-haiku-4-5': 200000,
};

export function ContextBar() {
  const entries = useChatStore(e => e.entries);
  const streamingText = useChatStore(e => e.streamingText);
  const currentModel = useAppStore(e => e.currentModel);

  // Simple token estimate: chars / 4
  let totalChars = 0;
  for (const e of entries) {
    totalChars += e.content.length;
    if (e.toolResult) totalChars += e.toolResult.length;
    if (e.toolArgs) totalChars += e.toolArgs.length;
  }
  totalChars += streamingText.length;
  const tokens = Math.round(totalChars / 4);
  const limit = MODEL_LIMITS[currentModel] || 128000;
  const pct = Math.min(100, Math.round((tokens / limit) * 100));

  const barColor = pct > 80 ? 'var(--error)' : pct > 60 ? 'var(--warning)' : 'var(--accent)';

  return (
    <div className="context-bar">
      <div className="context-bar-fill" style={{ width: `${pct}%`, background: barColor }} />
      <span className="context-bar-text">
        {tokens.toLocaleString()} / {(limit / 1000).toFixed(0)}K tokens
      </span>
    </div>
  );
}
