import React, { useEffect, useState } from 'react';
import { useActiveRunState, useChatStore } from '../stores/chat-store';
import { useAppStore } from '../stores/app-store';

function toRunStatus(status: any) {
  return {
    currentTokens: Number(status.currentTokens ?? status.estimatedTokens) || 0,
    estimatedTokens: Number(status.estimatedTokens ?? status.currentTokens) || 0,
    contextLimit: Number(status.contextLimit) || 0,
    effectiveWindow: Number(status.effectiveWindow) || 0,
    reservedOutputTokens: Number(status.reservedOutputTokens) || 0,
    autoCompactThreshold: Number(status.autoCompactThreshold) || 0,
    autoCompactBufferTokens: Number(status.autoCompactBufferTokens) || 0,
    blockingThreshold: Number(status.blockingThreshold) || 0,
    freeTokens: Number(status.freeTokens) || 0,
    percentUsed: Number(status.percentUsed) || 0,
    willAutoCompact: Boolean(status.willAutoCompact),
    contextSource: status.contextSource || status.source || 'estimate',
    compacting: Boolean(status.compacting),
    compacted: Boolean(status.compacted),
    lastCompactAt: status.lastCompactAt || null,
    compactCount: Number(status.compactCount) || 0,
    compactError: status.compactError || null,
    consecutiveCompactFailures: Number(status.consecutiveCompactFailures) || 0,
  };
}

function formatTokens(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0';
  if (value >= 1000) return `${(value / 1000).toFixed(value >= 100000 ? 0 : 1)}K`;
  return `${Math.round(value)}`;
}

export function ContextBar() {
  const activeId = useChatStore(s => s.activeId);
  const setRunStatusTo = useChatStore(s => s.setRunStatusTo);
  const runState = useActiveRunState();
  const currentModel = useAppStore(e => e.currentModel);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const load = (refresh = false) => {
      if (!activeId) return;
      const api = window.electronAPI;
      const fn = refresh ? api?.refreshAgentContextStatus : api?.getAgentContextStatus;
      if (!fn) return;
      setLoading(true);
      fn(activeId)
        .then((status: any) => {
          if (!status) return;
          setRunStatusTo(activeId, { phase: runState.phase, ...toRunStatus(status) });
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    };
    const handler = () => load(true);
    window.addEventListener('providers-changed', handler);
    return () => window.removeEventListener('providers-changed', handler);
  }, [activeId, runState.phase, setRunStatusTo]);

  useEffect(() => {
    if (!activeId || !window.electronAPI?.getAgentContextStatus) return;
    let cancelled = false;
    setLoading(true);
    window.electronAPI.getAgentContextStatus(activeId)
      .then((status: any) => {
        if (cancelled || !status) return;
        setRunStatusTo(activeId, { phase: runState.phase, ...toRunStatus(status) });
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [activeId, currentModel, setRunStatusTo]);

  const currentTokens = runState.currentTokens || runState.estimatedTokens || 0;
  const effectiveWindow = runState.effectiveWindow || runState.contextLimit || 0;
  const contextLimit = runState.contextLimit || 0;
  const pct = Math.min(100, Math.max(0, Math.round(runState.percentUsed || (effectiveWindow ? currentTokens / effectiveWindow * 100 : 0))));
  const barColor = runState.compactError
    ? 'var(--error)'
    : runState.willAutoCompact || pct > 80
      ? 'var(--warning)'
      : 'var(--accent)';
  const compactCount = runState.compactCount || 0;
  const label = loading && !currentTokens
    ? '...'
    : `上下文: ${formatTokens(currentTokens)} / ${formatTokens(contextLimit)}  压缩次数: ${compactCount}`;
  const title = [
    `Current context: ${Math.round(currentTokens).toLocaleString()} tokens`,
    `Auto compact threshold: ${Math.round(runState.autoCompactThreshold || 0).toLocaleString()} tokens`,
    `Context window: ${Math.round(contextLimit).toLocaleString()} tokens`,
    `Effective free tokens: ${Math.round(runState.freeTokens || 0).toLocaleString()} tokens`,
    `Compact count: ${compactCount}`,
    `Source: ${runState.contextSource === 'usage' ? 'API usage + delta estimate' : 'tokenizer estimate'}`,
    runState.compactError ? `Compact error: ${runState.compactError}` : '',
  ].filter(Boolean).join('\n');

  return (
    <div className="context-meter" title={title}>
      <div className="context-bar-label">{label}</div>
      <div className="context-bar">
        <div className="context-bar-fill" style={{ width: `${pct}%`, background: barColor }} />
      </div>
    </div>
  );
}
