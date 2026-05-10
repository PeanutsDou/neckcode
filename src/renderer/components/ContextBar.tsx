import React, { useEffect, useState } from 'react';
import { useActiveEntries, useActiveStreamingText } from '../stores/chat-store';
import { useAppStore } from '../stores/app-store';

const SYSTEM_PROMPT_ESTIMATE = 800;

function estimateTokens(text: string): number {
  let cjk = 0;
  let ascii = 0;
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    if (
      (code >= 0x4E00 && code <= 0x9FFF) ||
      (code >= 0x3400 && code <= 0x4DBF) ||
      (code >= 0x3000 && code <= 0x303F) ||
      (code >= 0xFF00 && code <= 0xFFEF) ||
      (code >= 0xAC00 && code <= 0xD7AF)
    ) {
      cjk++;
    } else if (code > 127) {
      cjk++;
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
  const [modelContexts, setModelContexts] = useState<Record<string, number>>({});

  useEffect(() => {
    const load = () => {
      window.electronAPI?.getConfig().then((c: any) => {
        if (c.modelContexts) setModelContexts(c.modelContexts);
      }).catch(() => {});
    };
    load();
    const handler = () => load();
    window.addEventListener('providers-changed', handler);
    return () => window.removeEventListener('providers-changed', handler);
  }, []);

  let totalTokens = SYSTEM_PROMPT_ESTIMATE;
  for (const e of entries) {
    totalTokens += estimateTokens(e.content);
    if (e.toolResult) totalTokens += estimateTokens(e.toolResult);
    if (e.toolArgs) totalTokens += estimateTokens(e.toolArgs);
  }
  totalTokens += estimateTokens(streamingText);

  const limit = modelContexts[currentModel] || 128_000;
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
