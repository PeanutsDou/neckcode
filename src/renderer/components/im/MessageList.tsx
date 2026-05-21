import React, { useRef, useEffect } from 'react';
import { useImStore } from '../../stores/im-store';
import type { ImMessage } from '../../../shared/im-types';

export function MessageList({ peerId }: { peerId: string }) {
  const messages = useImStore((s) => s.messages[peerId] || []);
  const currentUserId = useImStore((s) => s.authState.user?.userId);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  // 加载历史
  useEffect(() => {
    window.electronAPI!.imListMessages(peerId).then((result: any) => {
      if (result.messages) {
        useImStore.getState().setMessages(peerId, result.messages);
      }
    });
    // 也拉服务端历史
    window.electronAPI!.imLoadHistory(peerId, { limit: 30 }).catch(() => {});
  }, [peerId]);

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '12px 16px' }}>
      {messages.length === 0 && (
        <div style={{ color: 'var(--text-muted)', fontSize: 12, textAlign: 'center', paddingTop: 40 }}>
          暂无消息，发送第一条消息吧
        </div>
      )}
      {messages.map((msg, i) => {
        const isOut = msg.direction === 'out';
        const showStatus = isOut;
        return (
          <div key={msg.localId || msg.messageId || i} style={{
            display: 'flex', justifyContent: isOut ? 'flex-end' : 'flex-start', marginBottom: 8,
          }}>
            <div style={{
              maxWidth: '70%', padding: '8px 12px', borderRadius: 12,
              background: isOut ? 'var(--accent)' : 'var(--bg-surface)',
              color: isOut ? '#fff' : 'var(--text-primary)', fontSize: 13,
              borderBottomRightRadius: isOut ? 4 : 12,
              borderBottomLeftRadius: isOut ? 12 : 4,
              wordBreak: 'break-word',
            }}>
              <div>{msg.content}</div>
              {showStatus && (
                <div style={{ fontSize: 10, marginTop: 4, opacity: 0.7, textAlign: 'right' }}>
                  {msg.status === 'pending' && '发送中...'}
                  {msg.status === 'sent' && '✓'}
                  {msg.status === 'delivered' && '✓✓'}
                  {msg.status === 'read' && '✓✓'}
                  {msg.status === 'failed' && '❌ 重试'}
                  {msg.status === 'failed' && (
                    <span style={{ cursor: 'pointer', marginLeft: 4, textDecoration: 'underline' }}
                      onClick={() => {
                        window.electronAPI!.imSendMessage({ toUser: peerId, content: msg.content });
                      }}
                    >重试</span>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}
