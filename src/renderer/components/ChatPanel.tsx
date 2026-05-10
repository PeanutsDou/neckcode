import React, { memo } from 'react';
import {
  useChatStore,
  useActiveEntries,
  useActiveStreamingText,
  useActiveIsStreaming,
  useActiveRunStartedAt,
  useActiveError,
  useActiveThinkingText,
  useActiveRunState,
  type ChatEntry,
} from '../stores/chat-store';
import { ChatInput } from './ChatInput';
import { MessageBubble } from './MessageBubble';
import { StreamingBubble } from './StreamingBubble';
import { useIpcListeners } from '../hooks/useIpcListeners';
import { useScrollToBottom } from '../hooks/useScrollToBottom';
import { useStreamTimer } from '../hooks/useStreamTimer';
import { useStreamMetric } from '../hooks/useStreamTokens';
import type { AgentError } from '../../shared/types';

/* ── Memoised entry list — skips re-render during streaming ── */
const EntryList = memo(function EntryList({ entries }: { entries: ChatEntry[] }) {
  return <>{entries.map(entry => <MessageBubble key={entry.id} entry={entry} />)}</>;
});

/* ── Error normalisation ── */
function normalizeError(error: string | AgentError): AgentError {
  if (typeof error !== 'string') return error;
  return {
    code: 'unknown',
    message: error,
    suggestion: '请复制错误信息后重试；如果持续出现，检查 Provider 配置和网络连接。',
    retryable: true,
    raw: error,
  };
}

/* ── ChatPanel ── */
export function ChatPanel() {
  const store = useChatStore;
  const entries = useActiveEntries();
  const streamingText = useActiveStreamingText();
  const thinkingText = useActiveThinkingText();
  const isStreaming = useActiveIsStreaming();
  const runStartedAt = useActiveRunStartedAt();
  const runState = useActiveRunState();
  const error = useActiveError();
  const activeId = useChatStore(s => s.activeId);

  // ── hooks ──
  useIpcListeners();
  const bottomRef = useScrollToBottom({ entries, streamingText, thinkingText, isStreaming });
  const elapsed = useStreamTimer(isStreaming, runStartedAt);
  const streamMetric = useStreamMetric(entries, streamingText, thinkingText, isStreaming, runState, elapsed);

  // ── callbacks ──
  const retryLast = () => {
    const state = store.getState();
    const sid = state.activeId;
    if (!sid) return;
    const ses = state.sessions[sid];
    const lastUser = [...(ses?.entries || [])].reverse().find(e => e.role === 'user');
    if (!lastUser) return;
    const attachments = lastUser.attachments?.map(a => ({
      type: a.type, data: a.data, mimeType: a.type === 'image' ? 'image/png' : 'text/plain',
    }));
    state.setErrorTo(sid, null);
    state.setStreamingTo(sid, true);
    window.electronAPI?.sendMessage(sid, lastUser.content, attachments as any).catch(err => {
      store.getState().setErrorTo(sid, err instanceof Error ? err.message : String(err));
    });
  };

  const openSettings = () => window.dispatchEvent(new CustomEvent('open-settings'));

  // ── render ──
  return (
    <div className="chat-panel">
      <div className="chat-messages">
        {entries.length === 0 && !streamingText && (
          <div className="chat-empty">
            <h2>DeepSeek Code</h2>
            <p>输入你的问题开始对话</p>
          </div>
        )}

        <EntryList entries={entries} />

        {isStreaming && (
          <StreamingBubble sessionId={activeId || 'default'} streamMetric={streamMetric} />
        )}

        {error && (
          <div className="message message-system error">
            {(() => {
              const normalized = normalizeError(error);
              return (
                <div className="message-content">
                  <strong>Error: {normalized.code}</strong>
                  <p>{normalized.message}</p>
                  <p className="error-suggestion">{normalized.suggestion}</p>
                  <div className="error-actions">
                    {normalized.retryable && <button className="settings-btn-sm" onClick={retryLast}>重试</button>}
                    {(normalized.code === 'auth_error' || normalized.code === 'model_not_found') && (
                      <button className="settings-btn-sm" onClick={openSettings}>打开设置</button>
                    )}
                    <button className="settings-btn-sm" onClick={() => navigator.clipboard.writeText(normalized.raw || normalized.message)}>复制错误</button>
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      <ChatInput />
    </div>
  );
}
