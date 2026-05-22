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
      <div style={emptyStyle}>
        <div style={{ color: 'var(--text-primary)', fontSize: 18, marginBottom: 8 }}>选择一个好友开始对话</div>
        <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>消息会缓存在本地，重连后自动同步离线消息。</div>
      </div>
    );
  }

  const friend = friends.find((f) => f.userId === activePeerId);

  const handleRemoveFriend = async () => {
    const name = friend?.displayName || activePeerId;
    if (!window.confirm(`删除好友「${name}」？本地会话入口会移除，历史消息缓存暂不清理。`)) return;
    const result = await window.electronAPI!.imRemoveFriend(activePeerId);
    if ((result as any)?.error) {
      useImStore.getState().setError((result as any).error);
      return;
    }
    useImStore.getState().removeFriend(activePeerId);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={headerStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <span style={{ ...dotStyle, background: friend?.online ? 'var(--success)' : 'var(--text-muted)' }} />
          <span style={nameStyle}>{friend?.displayName || activePeerId}</span>
          <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{friend?.online ? '在线' : '离线'}</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={handleRemoveFriend} style={closeStyle}>删除好友</button>
          <button onClick={() => setActivePeer(null)} style={closeStyle}>×</button>
        </div>
      </div>

      <MessageList peerId={activePeerId} />
      <MessageComposer peerId={activePeerId} />
    </div>
  );
}

const emptyStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  height: '100%',
  textAlign: 'center',
};

const headerStyle: React.CSSProperties = {
  padding: '11px 14px',
  borderBottom: '1px solid var(--border)',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  background: 'var(--bg-secondary)',
};

const dotStyle: React.CSSProperties = {
  width: 8,
  height: 8,
  borderRadius: '50%',
  flexShrink: 0,
};

const nameStyle: React.CSSProperties = {
  color: 'var(--text-primary)',
  fontSize: 13,
  fontWeight: 650,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const closeStyle: React.CSSProperties = {
  padding: '3px 8px',
  border: '1px solid var(--border)',
  borderRadius: 7,
  cursor: 'pointer',
  background: 'var(--bg-surface)',
  color: 'var(--text-secondary)',
  fontSize: 12,
};
