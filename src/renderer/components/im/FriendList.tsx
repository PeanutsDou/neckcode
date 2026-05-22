import React from 'react';
import { useImStore } from '../../stores/im-store';
import type { ImConversation, ImFriend } from '../../../shared/im-types';

type FriendItem = {
  friend: ImFriend;
  conversation?: ImConversation;
};

export function FriendList() {
  const friends = useImStore((s) => s.friends);
  const conversations = useImStore((s) => s.conversations);
  const activePeerId = useImStore((s) => s.activePeerId);
  const setActivePeer = useImStore((s) => s.setActivePeer);
  const toggleSearch = useImStore((s) => s.toggleSearch);
  const toggleRequests = useImStore((s) => s.toggleRequests);
  const requestCount = useImStore((s) => s.requests.filter((r) => r.direction === 'in').length);
  const clearUnread = useImStore((s) => s.clearUnread);

  const conversationByPeer = new Map(conversations.map((c) => [c.peerUserId, c]));
  const items: FriendItem[] = friends
    .map((friend) => ({ friend, conversation: conversationByPeer.get(friend.userId) }))
    .sort((a, b) => {
      const unreadA = a.conversation?.unreadCount || 0;
      const unreadB = b.conversation?.unreadCount || 0;
      if (unreadA > 0 && unreadB === 0) return -1;
      if (unreadB > 0 && unreadA === 0) return 1;
      return (b.conversation?.lastMessageAt || 0) - (a.conversation?.lastMessageAt || 0);
    });

  const handleSelect = (peerId: string) => {
    setActivePeer(peerId);
    clearUnread(peerId);
    window.electronAPI!.imClearUnread(peerId).catch(() => {});
  };

  return (
    <div style={containerStyle}>
      <div style={toolbarStyle}>
        <button onClick={toggleSearch} style={btnStyle}>添加好友</button>
        <button onClick={toggleRequests} style={{ ...btnStyle, position: 'relative' }}>
          请求
          {requestCount > 0 && <span style={badgeStyle}>{requestCount}</span>}
        </button>
      </div>

      <div style={listStyle}>
        {items.length === 0 ? (
          <div style={emptyStyle}>暂无好友。点击“添加好友”搜索用户。</div>
        ) : (
          items.map(({ friend, conversation }) => {
            const isActive = activePeerId === friend.userId;
            const unread = conversation?.unreadCount || 0;
            return (
              <button
                type="button"
                key={friend.userId}
                onClick={() => handleSelect(friend.userId)}
                style={{
                  ...itemStyle,
                  background: isActive ? 'var(--bg-hover)' : 'transparent',
                  borderColor: isActive ? 'var(--border)' : 'transparent',
                }}
              >
                <div style={rowStyle}>
                  <span style={{ ...dotStyle, background: friend.online ? 'var(--success)' : 'var(--text-muted)' }} />
                  <span style={nameStyle}>{friend.displayName || friend.username}</span>
                  {unread > 0 && <span style={unreadStyle}>{unread > 99 ? '99+' : unread}</span>}
                </div>
                <div style={previewStyle}>
                  {conversation?.lastMessagePreview || `@${friend.username}`}
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

const containerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  borderRight: '1px solid var(--border)',
  background: 'var(--bg-secondary)',
};

const toolbarStyle: React.CSSProperties = {
  display: 'flex',
  gap: 8,
  padding: '10px',
  borderBottom: '1px solid var(--border)',
};

const btnStyle: React.CSSProperties = {
  flex: 1,
  padding: '7px 0',
  border: '1px solid var(--border)',
  borderRadius: 8,
  background: 'var(--bg-primary)',
  color: 'var(--text-secondary)',
  fontSize: 12,
  cursor: 'pointer',
};

const badgeStyle: React.CSSProperties = {
  position: 'absolute',
  top: -6,
  right: -6,
  background: 'var(--error)',
  color: '#fff',
  fontSize: 10,
  borderRadius: 8,
  padding: '1px 5px',
  minWidth: 14,
  textAlign: 'center',
};

const listStyle: React.CSSProperties = {
  flex: 1,
  overflow: 'auto',
  padding: 8,
};

const emptyStyle: React.CSSProperties = {
  padding: 18,
  color: 'var(--text-muted)',
  fontSize: 12,
  textAlign: 'center',
  lineHeight: 1.7,
};

const itemStyle: React.CSSProperties = {
  width: '100%',
  display: 'block',
  textAlign: 'left',
  padding: '10px 10px',
  cursor: 'pointer',
  border: '1px solid transparent',
  borderRadius: 10,
  marginBottom: 4,
  color: 'var(--text-primary)',
};

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 7,
};

const dotStyle: React.CSSProperties = {
  width: 8,
  height: 8,
  borderRadius: '50%',
  flexShrink: 0,
};

const nameStyle: React.CSSProperties = {
  minWidth: 0,
  flex: 1,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  fontSize: 13,
};

const previewStyle: React.CSSProperties = {
  marginTop: 4,
  paddingLeft: 15,
  color: 'var(--text-muted)',
  fontSize: 11,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const unreadStyle: React.CSSProperties = {
  background: 'var(--accent)',
  color: '#fff',
  fontSize: 10,
  borderRadius: 8,
  padding: '1px 5px',
  minWidth: 14,
  textAlign: 'center',
  lineHeight: '16px',
};
