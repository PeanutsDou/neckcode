import React from 'react';
import { useImStore } from '../../stores/im-store';
import { MessageList } from './MessageList';
import { MessageComposer } from './MessageComposer';

export function DirectChat() {
  const activePeerId = useImStore((s) => s.activePeerId);
  const friends = useImStore((s) => s.friends);
  const setActivePeer = useImStore((s) => s.setActivePeer);

  if (!activePeerId) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100%', color: 'var(--text-muted)', fontSize: 13,
      }}>
        选择好友开始聊天
      </div>
    );
  }

  const friend = friends.find((f) => f.userId === activePeerId);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* 聊天顶部 */}
      <div style={{
        padding: '10px 14px', borderBottom: '1px solid var(--border)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        background: 'var(--bg-secondary)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            width: 8, height: 8, borderRadius: '50%',
            background: friend?.online ? '#6abf6a' : 'var(--text-muted)',
          }} />
          <span style={{ color: 'var(--text-primary)', fontSize: 13, fontWeight: 600 }}>
            {friend?.displayName || activePeerId}
          </span>
          <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>
            {friend?.online ? '在线' : '离线'}
          </span>
        </div>
        <button onClick={() => setActivePeer(null)}
          style={{
            padding: '2px 8px', border: 'none', borderRadius: 4, cursor: 'pointer',
            background: 'var(--bg-surface)', color: 'var(--text-secondary)', fontSize: 12,
          }}
        >✕</button>
      </div>

      {/* 消息列表 */}
      <MessageList peerId={activePeerId} />

      {/* 输入框 */}
      <MessageComposer peerId={activePeerId} />
    </div>
  );
}
