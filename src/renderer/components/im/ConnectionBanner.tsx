import React from 'react';
import { useImStore } from '../../stores/im-store';

export function ConnectionBanner() {
  const connectionState = useImStore((s) => s.connectionState);
  const error = useImStore((s) => s.error);

  if (connectionState === 'online') return null;

  const stateMap: Record<string, { text: string; color: string }> = {
    connecting: { text: '正在连接...', color: 'var(--accent-dim)' },
    authenticating: { text: '正在登录...', color: 'var(--accent-dim)' },
    reconnecting: { text: '连接断开，正在重连...', color: '#c9a050' },
    offline: { text: '离线（显示本地缓存）', color: 'var(--text-muted)' },
    error: { text: error?.message || '连接错误', color: '#c06060' },
    idle: { text: '未连接', color: 'var(--text-muted)' },
  };

  const info = stateMap[connectionState] || { text: connectionState, color: 'var(--text-muted)' };

  return (
    <div style={{
      padding: '4px 12px', background: 'var(--bg-surface)',
      color: info.color, fontSize: 11, textAlign: 'center',
      borderBottom: '1px solid var(--border)',
    }}>
      {info.text}
    </div>
  );
}
