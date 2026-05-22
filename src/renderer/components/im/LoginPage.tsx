import React, { useState } from 'react';
import { useImStore } from '../../stores/im-store';

function validate(mode: 'login' | 'register', username: string, password: string, displayName: string, confirmPassword: string): string {
  if (!/^[A-Za-z0-9_-]{3,32}$/.test(username.trim())) return '用户名需为 3-32 位字母、数字、下划线或短横线';
  if (password.length < 6 || password.length > 128) return '密码需为 6-128 位';
  if (mode === 'register') {
    if (!displayName.trim() || displayName.trim().length > 32) return '显示名称需为 1-32 个字符';
    if (password !== confirmPassword) return '两次输入的密码不一致';
  }
  return '';
}

export function LoginPage() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const connectionState = useImStore((s) => s.connectionState);

  const switchMode = (next: 'login' | 'register') => {
    setMode(next);
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validation = validate(mode, username, password, displayName, confirmPassword);
    if (validation) {
      setError(validation);
      return;
    }

    setLoading(true);
    setError('');
    try {
      const result = mode === 'register'
        ? await window.electronAPI!.imRegister({ username: username.trim(), password, displayName: displayName.trim() })
        : await window.electronAPI!.imLogin({ username: username.trim(), password });
      if ((result as any).error) throw new Error((result as any).error.message);
    } catch (err: any) {
      setError(err?.message || '请求失败，请确认 IM 服务已启动');
    } finally {
      setLoading(false);
    }
  };

  const disabled = loading || connectionState === 'connecting' || connectionState === 'authenticating';

  return (
    <div style={pageStyle}>
      <section style={cardStyle}>
        <div style={{ marginBottom: 26 }}>
          <div style={eyebrowStyle}>DeepSeek Code</div>
          <h2 style={titleStyle}>IM 通讯</h2>
          <p style={descStyle}>登录后可进行好友检索、请求处理和一对一消息同步。</p>
        </div>

        <div style={tabsStyle}>
          <button type="button" onClick={() => switchMode('login')} style={tabStyle(mode === 'login')}>登录</button>
          <button type="button" onClick={() => switchMode('register')} style={tabStyle(mode === 'register')}>注册</button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 12 }}>
          <label style={labelStyle}>
            用户名
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              style={inputStyle}
              autoFocus
              autoComplete="username"
              placeholder="3-32 位英文、数字或下划线"
            />
          </label>

          {mode === 'register' && (
            <label style={labelStyle}>
              显示名称
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                style={inputStyle}
                autoComplete="nickname"
                placeholder="好友列表中显示的名称"
              />
            </label>
          )}

          <label style={labelStyle}>
            密码
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={inputStyle}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              placeholder="至少 6 位"
            />
          </label>

          {mode === 'register' && (
            <label style={labelStyle}>
              确认密码
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                style={inputStyle}
                autoComplete="new-password"
                placeholder="再次输入密码"
              />
            </label>
          )}

          {error && <div style={errorStyle}>{error}</div>}

          <button type="submit" disabled={disabled} style={submitStyle(disabled)}>
            {loading ? '处理中...' : mode === 'login' ? '登录 IM' : '创建账号'}
          </button>
        </form>
      </section>
    </div>
  );
}

const pageStyle: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 32,
  background: 'var(--bg-primary)',
};

const cardStyle: React.CSSProperties = {
  width: 390,
  maxWidth: '100%',
  padding: '30px 32px 32px',
  border: '1px solid var(--border)',
  borderRadius: 18,
  background: 'var(--bg-secondary)',
  boxShadow: '0 18px 45px color-mix(in srgb, var(--accent) 12%, transparent)',
};

const eyebrowStyle: React.CSSProperties = {
  color: 'var(--accent)',
  fontSize: 12,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  marginBottom: 8,
};

const titleStyle: React.CSSProperties = {
  margin: 0,
  color: 'var(--text-primary)',
  fontSize: 26,
  fontWeight: 650,
};

const descStyle: React.CSSProperties = {
  margin: '8px 0 0',
  color: 'var(--text-secondary)',
  fontSize: 13,
  lineHeight: 1.7,
};

const tabsStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: 6,
  padding: 4,
  borderRadius: 12,
  background: 'var(--bg-surface)',
  border: '1px solid color-mix(in srgb, var(--border) 70%, transparent)',
  marginBottom: 18,
};

const tabStyle = (active: boolean): React.CSSProperties => ({
  border: '1px solid transparent',
  borderRadius: 9,
  padding: '8px 0',
  cursor: 'pointer',
  background: active ? 'var(--bg-primary)' : 'transparent',
  color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
  boxShadow: active ? '0 1px 6px color-mix(in srgb, var(--accent) 14%, transparent)' : 'none',
});

const labelStyle: React.CSSProperties = {
  display: 'grid',
  gap: 6,
  color: 'var(--text-secondary)',
  fontSize: 12,
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  boxSizing: 'border-box',
  border: '1px solid var(--border)',
  borderRadius: 10,
  background: 'var(--bg-primary)',
  color: 'var(--text-primary)',
  fontSize: 13,
  outline: 'none',
};

const errorStyle: React.CSSProperties = {
  color: 'var(--error)',
  fontSize: 12,
  lineHeight: 1.5,
  padding: '8px 10px',
  border: '1px solid color-mix(in srgb, var(--error) 34%, transparent)',
  borderRadius: 10,
  background: 'color-mix(in srgb, var(--error) 8%, var(--bg-primary))',
};

const submitStyle = (disabled: boolean): React.CSSProperties => ({
  marginTop: 4,
  width: '100%',
  padding: '10px 0',
  border: '1px solid var(--accent)',
  borderRadius: 11,
  cursor: disabled ? 'not-allowed' : 'pointer',
  background: disabled ? 'var(--bg-surface)' : 'var(--accent)',
  color: disabled ? 'var(--text-muted)' : '#fff',
  fontSize: 14,
  opacity: disabled ? 0.72 : 1,
});
