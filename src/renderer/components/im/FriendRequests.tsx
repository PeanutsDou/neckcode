import React, { useState } from 'react';
import { useImStore } from '../../stores/im-store';

export function FriendRequests() {
  const [error, setError] = useState('');
  const requests = useImStore((s) => s.requests);
  const toggleRequests = useImStore((s) => s.toggleRequests);

  const incoming = requests.filter((r) => r.direction === 'in');
  const outgoing = requests.filter((r) => r.direction === 'out');

  const handleAccept = async (userId: string) => {
    setError('');
    try {
      const result = await window.electronAPI!.imAcceptFriend(userId);
      if ((result as any).error) throw new Error((result as any).error.message);
    } catch (err: any) {
      setError(err?.message || '处理失败');
    }
  };

  return (
    <div style={panelStyle}>
      <div style={headerStyle}>
        <span style={{ color: 'var(--text-primary)', fontSize: 13, fontWeight: 600 }}>好友请求</span>
        <button onClick={toggleRequests} style={closeStyle}>×</button>
      </div>

      {error && <div style={errorStyle}>{error}</div>}

      <div style={{ flex: 1, overflow: 'auto' }}>
        {incoming.length === 0 && outgoing.length === 0 ? (
          <div style={emptyStyle}>暂无好友请求</div>
        ) : (
          <>
            {incoming.map((req) => (
              <div key={`in-${req.userId}`} style={rowStyle}>
                <div>
                  <div style={{ color: 'var(--text-primary)', fontSize: 13 }}>{req.displayName}</div>
                  <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>@{req.username}</div>
                </div>
                <button onClick={() => handleAccept(req.userId)} style={actionBtnStyle}>接受</button>
              </div>
            ))}
            {outgoing.map((req) => (
              <div key={`out-${req.userId}`} style={rowStyle}>
                <div>
                  <div style={{ color: 'var(--text-primary)', fontSize: 13 }}>{req.displayName}</div>
                  <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>@{req.username}</div>
                </div>
                <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>等待对方确认</span>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

const panelStyle: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  zIndex: 10,
  background: 'var(--bg-primary)',
  display: 'flex',
  flexDirection: 'column',
  borderRight: '1px solid var(--border)',
};

const headerStyle: React.CSSProperties = {
  padding: 10,
  borderBottom: '1px solid var(--border)',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
};

const closeStyle: React.CSSProperties = {
  padding: '3px 8px',
  border: '1px solid var(--border)',
  borderRadius: 7,
  background: 'var(--bg-surface)',
  color: 'var(--text-secondary)',
  fontSize: 12,
  cursor: 'pointer',
};

const errorStyle: React.CSSProperties = {
  color: 'var(--error)',
  fontSize: 12,
  padding: '7px 10px',
};

const rowStyle: React.CSSProperties = {
  padding: 10,
  borderBottom: '1px solid color-mix(in srgb, var(--border) 55%, transparent)',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: 8,
};

const actionBtnStyle: React.CSSProperties = {
  padding: '4px 12px',
  border: '1px solid var(--accent)',
  borderRadius: 7,
  cursor: 'pointer',
  background: 'var(--accent)',
  color: '#fff',
  fontSize: 12,
};

const emptyStyle: React.CSSProperties = {
  padding: 20,
  color: 'var(--text-muted)',
  fontSize: 12,
  textAlign: 'center',
};
