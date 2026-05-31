import React, { useMemo } from 'react';
import {
  useChatStore,
  useActiveEntries,
  useActiveStreamingText,
  useActiveIsStreaming,
  useActiveRunStartedAt,
  useActiveError,
  useActiveThinkingText,
  useActiveRunState,
} from '../stores/chat-store';
import type { ChatEntry } from '../stores/chat-store';
import { ChatInput } from './ChatInput';
import { VirtualizedEntryList } from './VirtualizedEntryList';
import { useIpcListeners } from '../hooks/useIpcListeners';
import { useStreamTimer } from '../hooks/useStreamTimer';
import { useStreamMetric } from '../hooks/useStreamTokens';
import { inferImageMimeType } from '../utils/attachments';


/** Hide individual tool entries that are grouped under a tool summary. */
function filterToolEntries(entries: ChatEntry[]): ChatEntry[] {
  const result: ChatEntry[] = [];
  let skipUntilSummary = false;
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (entry.role === 'system' && entry.toolSummary) {
      // Remove preceding tool entries back to the last non-tool entry
      while (result.length > 0) {
        const last = result[result.length - 1];
        if (last.role === 'tool') {
          result.pop();
        } else {
          break;
        }
      }
    }
    result.push(entry);
  }
  return result;
}

export function ChatPanel() {
  const store = useChatStore;
  const rawEntries = useActiveEntries();
  const entries = useMemo(() => filterToolEntries(rawEntries), [rawEntries]);
  const streamingText = useActiveStreamingText();
  const thinkingText = useActiveThinkingText();
  const isStreaming = useActiveIsStreaming();
  const runStartedAt = useActiveRunStartedAt();
  const runState = useActiveRunState();
  const error = useActiveError();
  const activeId = useChatStore(s => s.activeId);

  useIpcListeners();
  const elapsed = useStreamTimer(isStreaming, runStartedAt);
  const streamMetric = useStreamMetric(entries, streamingText, thinkingText, isStreaming, runState, elapsed);

  const retryLast = async () => {
    const state = store.getState();
    const sid = state.activeId;
    if (!sid) return;
    const ses = state.sessions[sid];
    const lastUser = [...(ses?.entries || [])].reverse().find(e => e.role === 'user');
    if (!lastUser) return;
    const attachments = lastUser.attachments?.map(a => ({
      type: a.type,
      data: a.data,
      mimeType: a.mimeType || (a.type === 'image' ? inferImageMimeType(a.data) : 'text/plain'),
    }));
    state.setErrorTo(sid, null);
    state.setStreamingTo(sid, true);
    if (ses?.modelId) {
      state.setSessionModelTo(sid, ses.modelId);
      await window.electronAPI?.setSessionModel?.(sid, ses.modelId).catch(() => {});
    }
    window.electronAPI?.sendMessage(sid, lastUser.content, attachments as any).catch(err => {
      store.getState().setErrorTo(sid, err instanceof Error ? err.message : String(err));
    });
  };

  const openSettings = () => window.dispatchEvent(new CustomEvent('open-settings'));
  const sessionId = activeId || 'default';
  const showEmpty = entries.length === 0 && !streamingText && !error;

  return (
    <div className="chat-panel">
      <div className="chat-messages">
        {showEmpty ? (
          <div className="chat-empty">
            <h2>Neck Code</h2>
            <p>输入你的问题开始对话</p>
          </div>
        ) : (
          <VirtualizedEntryList
            key={sessionId}
            sessionId={sessionId}
            entries={entries}
            streamingText={streamingText}
            thinkingText={thinkingText}
            isStreaming={isStreaming}
            streamMetric={streamMetric}
            error={error}
            onRetry={retryLast}
            onOpenSettings={openSettings}
          />
        )}
      </div>

      <ChatInput />
    </div>
  );
}
