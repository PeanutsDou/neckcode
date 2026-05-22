import React, { useEffect, useRef, useState } from 'react';
import { useImStore } from '../../stores/im-store';

export function FriendSearchDialog() {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const searchResults = useImStore((s) => s.searchResults);
  const setSearchResults = useImStore((s) => s.setSearchResults);
  const toggleSearch = useImStore((s) => s.toggleSearch);
  const setActivePeer = useImStore((s) => s.setActivePeer);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSearch = async () => {
    const value = query.trim();
    if (!value) return;
    setLoading(true);
    setError('');
    try {
      const result = await window.electronAPI!.imSearchUsers(value);
      if ((result as any).error) throw new Error((result as any).error.message);
      setSearchResults((result as any).users || []);
    } catch (err: any) {
      setError(err?.message || '搜索失败');
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async (userId: string) => {
    try {
      const result = await window.electronAPI!.imAddFriend(userId);
      if ((result as any).error) throw new Error((result as any).error.message);
      setSearchResults(searchResults.map((u) =>
        u.userId === userId ? { ...u, relation: (result as any).status === 'accepted' ? 'accepted' : 'pending_sent' } : u
      ));
    } catch (err: any) {
      setError(err?.message || '添加失败');
    }
  };

  const handleAccept = async (userId: string) => {
    try {
      const result = await window.electronAPI!.imAcceptFriend(userId);
      if ((result as any).error) throw new Error((result as any).error.message);
      setSearchResults(searchResults.map((u) => u.userId === userId ? { ...u, relation: 'accepted' } : u));
    } catch (err: any) {
      setError(err?.message || '接受失败');
    }
  };

  const handleChat = (userId: string) => {
    setActivePeer(userId);
    toggleSearch();
  };

  return (
    <div style={panelStyle}>
      <div style={headerStyle}>
        <input
          ref={inputRef}
          type="text"
          placeholder="搜索用户名、昵称或用户 ID"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          style={inputStyle}
        />
        <button onClick={handleSearch} disabled={loading} style={primaryBtnStyle(loading)}>
          {loading ? '搜索中' : '搜索'}
        </button>
        <button onClick={toggleSearch} style={ghostBtnStyle}>×</button>
      </div>

      {error && <div style={errorStyle}>{error}</div>}

      <div style={{ flex: 1, overflow: 'auto' }}>
        {searchResults.map((user) => (
          <div key={user.userId} style={resultStyle}>
            <div style={{ minWidth: 0 }}>
              <div style={{ color: 'var(--text-primary)', fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.displayName}</div>
              <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>@{user.username}</div>
            </div>
            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
              {user.relation === 'self' && <span style={hintStyle}>自己</span>}
              {user.relation === 'none' && <button onClick={() => handleAdd(user.userId)} style={actionBtnStyle}>添加</button>}
              {user.relation === 'pending_sent' && <span style={hintStyle}>已申请</span>}
              {user.relation === 'pending_received' && <button onClick={() => handleAccept(user.userId)} style={actionBtnStyle}>接受</button>}
              {user.relation === 'accepted' && <button onClick={() => handleChat(user.userId)} style={actionBtnStyle}>发消息</button>}
              {user.relation === 'blocked' && <span style={hintStyle}>已屏蔽</span>}
            </div>
          </div>
        ))}
        {searchResults.length === 0 && !loading && query.trim() && (
          <div style={emptyStyle}>没有匹配的用户</div>
        )}
        {searchResults.length === 0 && !query.trim() && (
          <div style={emptyStyle}>输入用户名或昵称开始搜索。</div>
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
  gap: 6,
};

const inputStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  padding: '7px 9px',
  border: '1px solid var(--border)',
  borderRadius: 8,
  background: 'var(--bg-secondary)',
  color: 'var(--text-primary)',
  fontSize: 12,
  outline: 'none',
};

const primaryBtnStyle = (disabled: boolean): React.CSSProperties => ({
  padding: '7px 10px',
  border: '1px solid var(--accent)',
  borderRadius: 8,
  cursor: disabled ? 'not-allowed' : 'pointer',
  background: disabled ? 'var(--bg-surface)' : 'var(--accent)',
  color: disabled ? 'var(--text-muted)' : '#fff',
  fontSize: 12,
});

const ghostBtnStyle: React.CSSProperties = {
  padding: '7px 9px',
  border: '1px solid var(--border)',
  borderRadius: 8,
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

const resultStyle: React.CSSProperties = {
  padding: 10,
  borderBottom: '1px solid color-mix(in srgb, var(--border) 55%, transparent)',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: 8,
};

const actionBtnStyle: React.CSSProperties = {
  padding: '4px 9px',
  border: '1px solid var(--accent)',
  borderRadius: 7,
  cursor: 'pointer',
  background: 'var(--accent)',
  color: '#fff',
  fontSize: 12,
};

const hintStyle: React.CSSProperties = {
  color: 'var(--text-muted)',
  fontSize: 12,
};

const emptyStyle: React.CSSProperties = {
  padding: 20,
  color: 'var(--text-muted)',
  fontSize: 12,
  textAlign: 'center',
  lineHeight: 1.7,
};
