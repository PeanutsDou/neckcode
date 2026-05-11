import React, { useEffect, useState } from 'react';
import { useActiveRunState, useChatStore } from '../stores/chat-store';
import { useAppStore } from '../stores/app-store';

export function ContextBar() {
  const activeId = useChatStore(s => s.activeId);
  const setRunStatusTo = useChatStore(s => s.setRunStatusTo);
  const runState = useActiveRunState();
  const currentModel = useAppStore(e => e.currentModel);
  const [modelContexts, setModelContexts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);

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

  useEffect(() => {
    if (!activeId || !window.electronAPI?.getAgentContextStatus) return;
    let cancelled = false;
    setLoading(true);
    window.electronAPI.getAgentContextStatus(activeId)
      .then((status: any) => {
        if (cancelled || !status) return;
        setRunStatusTo(activeId, {
          phase: runState.phase,
          estimatedTokens: Number(status.estimatedTokens) || 0,
          contextLimit: Number(status.contextLimit) || 0,
          compacted: false,
        });
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [activeId, currentModel]);

  const totalTokens = runState.estimatedTokens || 0;
  const limit = runState.contextLimit || modelContexts[currentModel] || 128_000;
  const pct = Math.min(100, Math.round((totalTokens / limit) * 100));

  const barColor = pct > 80 ? 'var(--error)' : pct > 60 ? 'var(--warning)' : 'var(--accent)';

  return (
    <div className="context-bar">
      <div className="context-bar-fill" style={{ width: `${pct}%`, background: barColor }} />
      <span className="context-bar-text">
        {loading ? '...' : totalTokens.toLocaleString()} / {(limit / 1000).toFixed(0)}K
      </span>
    </div>
  );
}
