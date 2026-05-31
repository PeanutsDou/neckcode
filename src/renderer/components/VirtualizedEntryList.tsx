import React, { memo, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  Virtuoso,
  type Components,
  type ContextProp,
  type ItemProps,
  type StateSnapshot,
  type VirtuosoHandle,
} from 'react-virtuoso';
import type { AgentError } from '../../shared/types';
import type { ChatEntry } from '../stores/chat-store';
import { MessageBubble } from './MessageBubble';
import { StreamingBubble } from './StreamingBubble';

interface VirtualizedEntryListProps {
  sessionId: string;
  entries: ChatEntry[];
  streamingText: string;
  thinkingText: string;
  isStreaming: boolean;
  streamMetric: string;
  error: string | AgentError | null;
  onRetry: () => void;
  onOpenSettings: () => void;
}

interface StoredVirtuosoState {
  count: number;
  snapshot: StateSnapshot;
}

interface VirtualizedListContext {
  sessionId: string;
  isStreaming: boolean;
  thinkingText: string;
  streamMetric: string;
  error: string | AgentError | null;
  onRetry: () => void;
  onOpenSettings: () => void;
}

const sessionVirtuosoStates = new Map<string, StoredVirtuosoState>();

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

function ErrorBlock({ error, onRetry, onOpenSettings }: {
  error: string | AgentError;
  onRetry: () => void;
  onOpenSettings: () => void;
}) {
  const normalized = normalizeError(error);
  return (
    <div className="message message-system error">
      <div className="message-content">
        <strong>Error: {normalized.code}</strong>
        <p>{normalized.message}</p>
        <p className="error-suggestion">{normalized.suggestion}</p>
        <div className="error-actions">
          {normalized.retryable && <button className="settings-btn-sm" onClick={onRetry}>重试</button>}
          {(normalized.code === 'auth_error' || normalized.code === 'model_not_found') && (
            <button className="settings-btn-sm" onClick={onOpenSettings}>打开设置</button>
          )}
          <button className="settings-btn-sm" onClick={() => navigator.clipboard.writeText(normalized.raw || normalized.message)}>
            复制错误
          </button>
        </div>
      </div>
    </div>
  );
}

function VirtualHeader() {
  return <div className="virtual-message-list-pad" />;
}

function VirtualFooter({ context }: ContextProp<VirtualizedListContext>) {
  return (
    <div className="virtual-message-footer">
      {context.isStreaming && (
        <StreamingBubble
          sessionId={context.sessionId}
          streamMetric={context.streamMetric}
          thinkingText={context.thinkingText}
        />
      )}
      {context.error && (
        <ErrorBlock
          error={context.error}
          onRetry={context.onRetry}
          onOpenSettings={context.onOpenSettings}
        />
      )}
      <div className="virtual-message-list-pad" />
    </div>
  );
}

function VirtualItem({
  children,
  style,
  item: _item,
  context: _context,
  ...props
}: ItemProps<ChatEntry> & ContextProp<VirtualizedListContext>) {
  return (
    <div {...props} style={style} className="virtual-message-row">
      {children}
    </div>
  );
}

const virtuosoComponents: Components<ChatEntry, VirtualizedListContext> = {
  Header: VirtualHeader,
  Footer: VirtualFooter,
  Item: VirtualItem,
};

export const VirtualizedEntryList = memo(function VirtualizedEntryList({
  sessionId,
  entries,
  streamingText,
  thinkingText,
  isStreaming,
  streamMetric,
  error,
  onRetry,
  onOpenSettings,
}: VirtualizedEntryListProps) {
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const atBottomRef = useRef(true);
  const entryCountRef = useRef(entries.length);
  const initialSnapshotRef = useRef<StateSnapshot | undefined>(
    sessionVirtuosoStates.get(sessionId)?.count === entries.length
      ? sessionVirtuosoStates.get(sessionId)?.snapshot
      : undefined,
  );
  const initialTopMostItemIndex = initialSnapshotRef.current || entries.length === 0
    ? undefined
    : { index: 'LAST' as const, align: 'end' as const };

  entryCountRef.current = entries.length;

  const context = useMemo<VirtualizedListContext>(() => ({
    sessionId,
    isStreaming,
    thinkingText,
    streamMetric,
    error,
    onRetry,
    onOpenSettings,
  }), [sessionId, isStreaming, thinkingText, streamMetric, error, onRetry, onOpenSettings]);

  const handleAtBottomChange = useCallback((atBottom: boolean) => {
    atBottomRef.current = atBottom;
  }, []);

  const followOutput = useCallback((isAtBottom: boolean) => {
    return isStreaming && isAtBottom ? 'auto' : false;
  }, [isStreaming]);

  useEffect(() => {
    return () => {
      virtuosoRef.current?.getState(snapshot => {
        sessionVirtuosoStates.set(sessionId, {
          count: entryCountRef.current,
          snapshot,
        });
      });
    };
  }, [sessionId]);

  useEffect(() => {
    if (!isStreaming || !atBottomRef.current) return;
    virtuosoRef.current?.autoscrollToBottom();
  }, [isStreaming, streamingText, thinkingText]);

  return (
    <Virtuoso
      ref={virtuosoRef}
      className="chat-messages-virtuoso"
      data={entries}
      components={virtuosoComponents}
      context={context}
      computeItemKey={(_index, entry) => entry.id}
      itemContent={(_index, entry) => <MessageBubble entry={entry} />}
      alignToBottom
      atBottomStateChange={handleAtBottomChange}
      followOutput={followOutput}
      increaseViewportBy={{ top: 600, bottom: 900 }}
      initialTopMostItemIndex={initialTopMostItemIndex}
      restoreStateFrom={initialSnapshotRef.current}
    />
  );
});
