import React from 'react';
import { useImStore } from '../../stores/im-store';
import type { ImConversation, ImFriend } from '../../../shared/im-types';

export function FriendList() {
  const friends = useImStore((s) => s.friends);
  const conversations = useImStore((s) => s.conversations);
  const activePeerId = useImStore((s) => s.activePeerId);
  const setActivePeer = useImStore((s) => s.setActivePeer);
  const toggleSearch = useImStore((s) => s.toggleSearch);
  const toggleRequests = useImStore((s) => s.toggleRequests);
  const requestCount = useImStore((s) => s.requests.length);
  const clearUnread = useImStore((s) => s.clearUnread);

  // 合并好友和会话信息
  const items = conversations
    .filter((c) => friends.some((f) => f.userId === c.peerUserId))
    .sort((a, b) => {
      // 未读优先
      if (a.unreadCount > 0 && b.unreadCount === 0) return -1;
      if (b.unreadCount > 0 && a.unreadCount === 0) return 1;
      // 按最后消息时间
      return (b.lastMessageAt || 0) - (a.lastMessageAt || 0);
    });

  const handleSelect = (peerId: string) => {
    setActivePeer(peerId);
    clearUnread(peerId);
  };

  return (
    <div style={containerStyle}>
      {/* 操作栏 */}
      <div style={{ display: 'flex', gap: 6, padding: '8px 10px', borderBottom: '1px solid var(--border)' }}>
        <button onClick={toggleSearch} style={btnStyle}>+ 搜索</button>
        {requestCount > 0 && (
          <button onClick={toggleRequests} style={{ ...btnStyle, position: 'relative' }}>
            申请 {requestCount > 0 && <span style={badgeStyle}>{requestCount}</span>}
          </button>
        )}
      </div>

      {/* 好友列表 */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {items.length === 0 ? (
          <div style={{ padding: 20, color: 'var(--text-muted)', fontSize: 12, textAlign: 'center' }}>
            暂无好友，搜索并添加好友
          </div>
        ) : (
          items.map((item) => {
            const friend = friends.find((f) => f.userId === item.peerUserId);
            const isActive = activePeerId === item.peerUserId;
            return (
              <div
                key={item.peerUserId}
                onClick={() => handleSelect(item.peerUserId)}
                style={{
                  ...itemStyle,
                  background: isActive ? 'var(--bg-hover)' : 'transparent',
                  fontWeight: isActive ? 600 : 400,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{
                    width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                    background: friend?.online ? '#6abf6a' : 'var(--text-muted)',
                  }} />
                  <span style={{ color: 'var(--text-primary)', fontSize: 13 }}>
                    {friend?.displayName || item.peerDisplayName || item.peerUserId}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
                  <span style={{ color: 'var(--text-muted)', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 140 }}>
                    {item.lastMessagePreview || ''}
                  </span>
                  {item.unreadCount > 0 && (
                    <span style={unreadStyle}>{item.unreadCount > 99 ? '99+' : item.unreadCount}</span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

const containerStyle: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', height: '100%',
  borderRight: '1px solid var(--border)', background: 'var(--bg-secondary)',
};

const btnStyle: React.CSSProperties = {
  flex: 1, padding: '4px 0', border: '1px solid var(--border)', borderRadius: 4,
  background: 'var(--bg-primary)', color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer',
};

const badgeStyle: React.CSSProperties = {
  position: 'absolute', top: -6, right: -6,
  background: '#c06060', color: '#fff', fontSize: 10, borderRadius: 8,
  padding: '1px 5px', minWidth: 14, textAlign: 'center',
};

const itemStyle: React.CSSProperties = {
  padding: '8px 10px', cursor: 'pointer', borderBottom: '1px solid color-mix(in srgb, var(--border) 50%, transparent)',
};

const unreadStyle: React.CSSProperties = {
  background: 'var(--accent)', color: '#fff', fontSize: 10, borderRadius: 8,
  padding: '1px 5px', minWidth: 14, textAlign: 'center', lineHeight: '16px',
};
