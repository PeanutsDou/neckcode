import React, { useEffect, useRef, useState } from 'react';
import { useImStore } from '../../stores/im-store';
import type { ImMessage } from '../../../shared/im-types';

const EMPTY_MESSAGES: ImMessage[] = [];

function formatTime(ts: number): string {
  return new Date(ts * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function statusText(status: ImMessage['status']): string {
  if (status === 'pending') return '发送中';
  if (status === 'failed') return '发送失败';
  if (status === 'read') return '已读';
  if (status === 'delivered') return '已送达';
  return '已发送';
}

export function MessageList({ peerId }: { peerId: string }) {
  const [loading, setLoading] = useState(false);
  const messages = useImStore((s) => s.messages[peerId] ?? EMPTY_MESSAGES);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, peerId]);

  useEffect(() => {
    let disposed = false;
    setLoading(true);

    window.electronAPI!.imListMessages(peerId, { limit: 80 }).then((result: any) => {
      if (!disposed && result.messages) {
        useImStore.getState().setMessages(peerId, result.messages);
      }
      return window.electronAPI!.imLoadHistory(peerId, { limit: 80 });
    }).then((result: any) => {
      if (!disposed && result?.messages) {
        useImStore.getState().setMessages(peerId, result.messages);
      }
    }).catch((err: unknown) => {
      if (!disposed) {
        useImStore.getState().setError({ code: 'LOAD_HISTORY_FAILED', message: String(err), source: 'client', retryable: true });
      }
    }).finally(() => {
      if (!disposed) setLoading(false);
    });

    return () => { disposed = true; };
  }, [peerId]);

  return (
    <div style={containerStyle}>
      {loading && <div style={loadingStyle}>正在同步消息...</div>}
      {messages.length === 0 && !loading && (
        <div style={emptyStyle}>暂无消息，发送第一条消息开始对话。</div>
      )}
      {messages.map((msg, i) => {
        const isOut = msg.direction === 'out';
        return (
          <div key={msg.localId || msg.messageId || i} style={{ display: 'flex', justifyContent: isOut ? 'flex-end' : 'flex-start', marginBottom: 10 }}>
            <div style={{ ...bubbleStyle, ...(isOut ? outBubbleStyle : inBubbleStyle) }}>
              <div style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</div>
              <div style={{ ...metaStyle, color: isOut ? 'rgba(255,255,255,0.78)' : 'var(--text-muted)' }}>
                <span>{formatTime(msg.createdAt)}</span>
                {isOut && <span>{statusText(msg.status)}</span>}
                {msg.status === 'failed' && (
                  <button
                    onClick={() => window.electronAPI!.imSendMessage({ toUser: peerId, content: msg.content })}
                    style={retryStyle}
                  >
                    重试
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}

const containerStyle: React.CSSProperties = {
  flex: 1,
  overflow: 'auto',
  padding: '14px 18px',
  background: 'var(--bg-primary)',
};

const loadingStyle: React.CSSProperties = {
  color: 'var(--text-muted)',
  fontSize: 11,
  textAlign: 'center',
  marginBottom: 12,
};

const emptyStyle: React.CSSProperties = {
  color: 'var(--text-muted)',
  fontSize: 12,
  textAlign: 'center',
  paddingTop: 42,
};

const bubbleStyle: React.CSSProperties = {
  maxWidth: '72%',
  padding: '8px 11px',
  borderRadius: 13,
  fontSize: 13,
  lineHeight: 1.6,
  wordBreak: 'break-word',
  border: '1px solid var(--border)',
};

const outBubbleStyle: React.CSSProperties = {
  background: 'var(--accent)',
  color: '#fff',
  borderColor: 'var(--accent)',
  borderBottomRightRadius: 5,
};

const inBubbleStyle: React.CSSProperties = {
  background: 'var(--bg-surface)',
  color: 'var(--text-primary)',
  borderBottomLeftRadius: 5,
};

const metaStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
  alignItems: 'center',
  gap: 7,
  fontSize: 10,
  marginTop: 4,
};

const retryStyle: React.CSSProperties = {
  padding: 0,
  border: 'none',
  background: 'transparent',
  color: 'inherit',
  textDecoration: 'underline',
  cursor: 'pointer',
  fontSize: 10,
};
