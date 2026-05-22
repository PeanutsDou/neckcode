import React from 'react';
import { useImStore } from '../../stores/im-store';

export function ConnectionBanner() {
  const connectionState = useImStore((s) => s.connectionState);
  const authState = useImStore((s) => s.authState);
  const error = useImStore((s) => s.error);

  if (connectionState === 'online') return null;
  if (authState.status === 'loggedOut' && connectionState === 'idle') return null;

  const info: Record<string, { text: string; color: string; retry?: boolean }> = {
    connecting: { text: '正在连接 IM 服务...', color: 'var(--accent-dim)' },
    authenticating: { text: '正在验证登录状态...', color: 'var(--accent-dim)' },
    reconnecting: { text: '连接断开，正在重连...', color: 'var(--warning)' },
    offline: { text: '离线模式：显示本地缓存', color: 'var(--text-muted)', retry: true },
    error: { text: error?.message || 'IM 连接错误', color: 'var(--error)', retry: true },
    idle: { text: 'IM 未连接', color: 'var(--text-muted)', retry: true },
  };
  const state = info[connectionState] || { text: connectionState, color: 'var(--text-muted)', retry: true };

  const retry = () => {
    window.electronAPI!.imConnect().catch(() => {});
  };

  return (
    <div style={bannerStyle}>
      <span style={{ color: state.color }}>{state.text}</span>
      {state.retry && (
        <button onClick={retry} style={retryStyle}>重连</button>
      )}
    </div>
  );
}

const bannerStyle: React.CSSProperties = {
  padding: '5px 12px',
  background: 'var(--bg-surface)',
  fontSize: 11,
  textAlign: 'center',
  borderBottom: '1px solid var(--border)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 10,
};

const retryStyle: React.CSSProperties = {
  border: '1px solid var(--border)',
  borderRadius: 7,
  background: 'var(--bg-primary)',
  color: 'var(--text-secondary)',
  fontSize: 11,
  padding: '2px 8px',
  cursor: 'pointer',
};
