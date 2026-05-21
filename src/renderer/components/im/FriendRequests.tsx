import React from 'react';
import { useImStore } from '../../stores/im-store';

export function FriendRequests() {
  const requests = useImStore((s) => s.requests);
  const addFriend = useImStore((s) => s.addFriend);
  const removeRequest = useImStore((s) => s.removeRequest);
  const toggleRequests = useImStore((s) => s.toggleRequests);

  const handleAccept = async (userId: string) => {
    try {
      const result = await window.electronAPI!.imAcceptFriend(userId);
      if ((result as any).error) throw new Error((result as any).error.message);
      const friendInfo = (result as any).friend || (result as any);
      addFriend({
        userId: friendInfo.userId || userId,
        username: friendInfo.username || '',
        displayName: friendInfo.displayName || '',
        avatar: friendInfo.avatar || null,
        status: 'accepted',
        online: friendInfo.online || false,
        lastSeenAt: null,
      });
      removeRequest(userId);
    } catch (err: any) {
      // ignore
    }
  };

  return (
    <div style={{
      position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 10,
      background: 'var(--bg-primary)', display: 'flex', flexDirection: 'column',
    }}>
      <div style={{ padding: '10px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ color: 'var(--text-primary)', fontSize: 13, fontWeight: 600 }}>好友申请</span>
        <button onClick={toggleRequests}
          style={{ padding: '2px 8px', border: 'none', borderRadius: 4, background: 'var(--bg-surface)', color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer' }}
        >✕</button>
      </div>

      <div style={{ flex: 1, overflow: 'auto' }}>
        {requests.length === 0 ? (
          <div style={{ padding: 20, color: 'var(--text-muted)', fontSize: 12, textAlign: 'center' }}>暂无好友申请</div>
        ) : (
          requests.map((req) => (
            <div key={req.userId} style={{
              padding: '10px', borderBottom: '1px solid color-mix(in srgb, var(--border) 50%, transparent)',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <div>
                <div style={{ color: 'var(--text-primary)', fontSize: 13 }}>{req.displayName}</div>
                <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>@{req.username}</div>
              </div>
              <button onClick={() => handleAccept(req.userId)}
                style={{
                  padding: '4px 12px', border: 'none', borderRadius: 4, cursor: 'pointer',
                  background: 'var(--accent)', color: '#fff', fontSize: 12,
                }}
              >接受</button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
