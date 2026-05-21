import React, { useState, useEffect, useRef } from 'react';
import { useImStore } from '../../stores/im-store';

export function FriendSearchDialog() {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const searchResults = useImStore((s) => s.searchResults);
  const setSearchResults = useImStore((s) => s.setSearchResults);
  const friends = useImStore((s) => s.friends);
  const requests = useImStore((s) => s.requests);
  const toggleSearch = useImStore((s) => s.toggleSearch);
  const addFriend = useImStore((s) => s.addFriend);
  const setActivePeer = useImStore((s) => s.setActivePeer);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setError('');
    try {
      const result = await window.electronAPI!.imSearchUsers(query.trim());
      if ((result as any).error) throw new Error((result as any).error.message);
      setSearchResults((result as any).users || []);
    } catch (err: any) {
      setError(err.message || '搜索失败');
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async (userId: string) => {
    try {
      const result = await window.electronAPI!.imAddFriend(userId);
      if ((result as any).error) throw new Error((result as any).error.message);
      // 乐观更新
      const user = searchResults.find((u) => u.userId === userId);
      if (user) {
        addFriend({
          userId: user.userId, username: user.username, displayName: user.displayName,
          avatar: user.avatar, status: 'accepted', online: false, lastSeenAt: null,
        });
      }
      setSearchResults(searchResults.map((u) =>
        u.userId === userId ? { ...u, relation: 'pending_sent' as const } : u
      ));
    } catch (err: any) {
      setError(err.message || '添加失败');
    }
  };

  const handleAccept = async (userId: string) => {
    try {
      const result = await window.electronAPI!.imAcceptFriend(userId);
      if ((result as any).error) throw new Error((result as any).error.message);
    } catch (err: any) {
      setError(err.message || '接受失败');
    }
  };

  const handleChat = (userId: string) => {
    setActivePeer(userId);
    toggleSearch();
  };

  const relationText: Record<string, string> = {
    self: '自己',
    none: '',
    pending_sent: '已申请',
    pending_received: '',
    accepted: '已添加',
    blocked: '已屏蔽',
  };

  return (
    <div style={{
      position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 10,
      background: 'var(--bg-primary)', display: 'flex', flexDirection: 'column',
    }}>
      {/* 搜索栏 */}
      <div style={{ padding: '10px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 6 }}>
        <input
          ref={inputRef}
          type="text" placeholder="搜索用户名或昵称..."
          value={query} onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          style={{
            flex: 1, padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 4,
            background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: 13, outline: 'none',
          }}
        />
        <button onClick={handleSearch} disabled={loading}
          style={{
            padding: '6px 12px', border: 'none', borderRadius: 4, cursor: loading ? 'not-allowed' : 'pointer',
            background: 'var(--accent)', color: '#fff', fontSize: 12, opacity: loading ? 0.7 : 1,
          }}
        >搜索</button>
        <button onClick={toggleSearch}
          style={{ padding: '6px 10px', border: 'none', borderRadius: 4, background: 'var(--bg-surface)', color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer' }}
        >✕</button>
      </div>

      {error && <div style={{ color: '#c06060', fontSize: 12, padding: '6px 10px' }}>{error}</div>}

      {/* 搜索结果 */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {searchResults.map((user) => (
          <div key={user.userId} style={{
            padding: '10px', borderBottom: '1px solid color-mix(in srgb, var(--border) 50%, transparent)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <div>
              <div style={{ color: 'var(--text-primary)', fontSize: 13 }}>{user.displayName}</div>
              <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>@{user.username}</div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              {user.relation === 'self' && <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>自己</span>}
              {user.relation === 'none' && (
                <button onClick={() => handleAdd(user.userId)} style={actionBtnStyle}>添加</button>
              )}
              {user.relation === 'pending_sent' && (
                <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>已申请</span>
              )}
              {user.relation === 'pending_received' && (
                <button onClick={() => handleAccept(user.userId)} style={actionBtnStyle}>接受</button>
              )}
              {user.relation === 'accepted' && (
                <button onClick={() => handleChat(user.userId)} style={actionBtnStyle}>发消息</button>
              )}
            </div>
          </div>
        ))}
        {searchResults.length === 0 && !loading && query && (
          <div style={{ padding: 20, color: 'var(--text-muted)', fontSize: 12, textAlign: 'center' }}>无结果</div>
        )}
      </div>
    </div>
  );
}

const actionBtnStyle: React.CSSProperties = {
  padding: '4px 10px', border: 'none', borderRadius: 4, cursor: 'pointer',
  background: 'var(--accent)', color: '#fff', fontSize: 12,
};
