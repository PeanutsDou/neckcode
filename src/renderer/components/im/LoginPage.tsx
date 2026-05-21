import React, { useState } from 'react';
import { useImStore } from '../../stores/im-store';

export function LoginPage() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (mode === 'register') {
      if (password !== confirmPassword) { setError('两次密码不一致'); return; }
      if (!displayName.trim()) { setError('请输入显示名称'); return; }
    }
    if (!username.trim() || !password) { setError('请填写所有字段'); return; }

    setLoading(true);
    try {
      if (mode === 'register') {
        const result = await window.electronAPI!.imRegister({ username: username.trim(), password, displayName: displayName.trim() });
        if ((result as any).error) throw new Error((result as any).error.message);
      } else {
        const result = await window.electronAPI!.imLogin({ username: username.trim(), password });
        if ((result as any).error) throw new Error((result as any).error.message);
      }
    } catch (err: any) {
      setError(err.message || '请求失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', padding: 40 }}>
      <form onSubmit={handleSubmit} style={{ width: 320 }}>
        <h3 style={{ margin: '0 0 20px', color: 'var(--text-primary)', textAlign: 'center' }}>
          {mode === 'login' ? '登录 IM' : '注册 IM'}
        </h3>

        <div style={{ display: 'flex', marginBottom: 16, gap: 8 }}>
          <button type="button"
            onClick={() => setMode('login')}
            style={{
              flex: 1, padding: '6px 0', border: 'none', borderRadius: 4, cursor: 'pointer',
              background: mode === 'login' ? 'var(--accent)' : 'var(--bg-surface)',
              color: mode === 'login' ? '#fff' : 'var(--text-secondary)', fontSize: 13,
            }}
          >登录</button>
          <button type="button"
            onClick={() => setMode('register')}
            style={{
              flex: 1, padding: '6px 0', border: 'none', borderRadius: 4, cursor: 'pointer',
              background: mode === 'register' ? 'var(--accent)' : 'var(--bg-surface)',
              color: mode === 'register' ? '#fff' : 'var(--text-secondary)', fontSize: 13,
            }}
          >注册</button>
        </div>

        <input
          type="text" placeholder="用户名"
          value={username} onChange={(e) => setUsername(e.target.value)}
          style={inputStyle}
          autoFocus
        />

        {mode === 'register' && (
          <input
            type="text" placeholder="显示名称"
            value={displayName} onChange={(e) => setDisplayName(e.target.value)}
            style={inputStyle}
          />
        )}

        <input
          type="password" placeholder="密码"
          value={password} onChange={(e) => setPassword(e.target.value)}
          style={inputStyle}
        />

        {mode === 'register' && (
          <input
            type="password" placeholder="确认密码"
            value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
            style={inputStyle}
          />
        )}

        {error && (
          <div style={{ color: '#c06060', fontSize: 12, marginBottom: 12 }}>{error}</div>
        )}

        <button type="submit" disabled={loading}
          style={{
            width: '100%', padding: '8px 0', border: 'none', borderRadius: 4, cursor: loading ? 'not-allowed' : 'pointer',
            background: 'var(--accent)', color: '#fff', fontSize: 14, opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? '请稍候...' : (mode === 'login' ? '登录' : '注册')}
        </button>
      </form>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 12px', marginBottom: 12, boxSizing: 'border-box',
  border: '1px solid var(--border)', borderRadius: 4,
  background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: 13,
  outline: 'none',
};
