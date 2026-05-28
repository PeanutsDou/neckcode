import React, { useEffect, useState } from 'react';
import { useImStore } from '../../stores/im-store';
import { MessageList } from './MessageList';
import { MessageComposer } from './MessageComposer';

export function DirectChat() {
  const activePeerId = useImStore((s) => s.activePeerId);
  const friends = useImStore((s) => s.friends);
  const setActivePeer = useImStore((s) => s.setActivePeer);
  const [imAgentEnabled, setImAgentEnabled] = useState(false);

  useEffect(() => {
    window.electronAPI?.getConfig?.().then((cfg: any) => {
      setImAgentEnabled(Boolean(cfg?.imAgent?.enabled));
    }).catch(() => {});
  }, []);

  const toggleImAgent = () => {
    const next = !imAgentEnabled;
    setImAgentEnabled(next);
    window.electronAPI?.setConfig?.('imAgent', {
      enabled: next,
      autoReplyWhenAway: next,
      allowSessionList: true,
      allowSessionPreview: false,
    }).catch(() => setImAgentEnabled(!next));
  };

  if (!activePeerId) {
    return (
      <div style={emptyStyle}>
        <div style={{ color: 'var(--text-primary)', fontSize: 18, marginBottom: 8 }}>Select a friend</div>
        <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Messages are cached locally and sync when online.</div>
      </div>
    );
  }

  const friend = friends.find((f) => f.userId === activePeerId);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={headerStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <span style={{ ...dotStyle, background: friend?.online ? 'var(--success)' : 'var(--text-muted)' }} />
          <span style={nameStyle}>{friend?.displayName || activePeerId}</span>
          <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{friend?.online ? 'Online' : 'Offline'}</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={toggleImAgent}
            style={{ ...agentButtonStyle, ...(imAgentEnabled ? agentButtonActiveStyle : {}) }}
            title="Experimental. Default permissions are read-only and limited."
          >
            Agent {imAgentEnabled ? 'On' : 'Off'}
          </button>
          <button onClick={() => setActivePeer(null)} style={closeStyle}>×</button>
        </div>
      </div>

      <MessageList peerId={activePeerId} />
      <MessageComposer peerId={activePeerId} />
    </div>
  );
}

const emptyStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  height: '100%',
  textAlign: 'center',
};

const headerStyle: React.CSSProperties = {
  padding: '11px 14px',
  borderBottom: '1px solid var(--border)',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  background: 'var(--bg-secondary)',
};

const dotStyle: React.CSSProperties = {
  width: 8,
  height: 8,
  borderRadius: '50%',
  flexShrink: 0,
};

const nameStyle: React.CSSProperties = {
  color: 'var(--text-primary)',
  fontSize: 13,
  fontWeight: 650,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const closeStyle: React.CSSProperties = {
  padding: '3px 8px',
  border: '1px solid var(--border)',
  borderRadius: 7,
  cursor: 'pointer',
  background: 'var(--bg-surface)',
  color: 'var(--text-secondary)',
  fontSize: 12,
};

const agentButtonStyle: React.CSSProperties = {
  padding: '3px 8px',
  border: '1px solid var(--border)',
  borderRadius: 7,
  cursor: 'pointer',
  background: 'var(--bg-surface)',
  color: 'var(--text-secondary)',
  fontSize: 12,
};

const agentButtonActiveStyle: React.CSSProperties = {
  borderColor: 'var(--accent)',
  color: 'var(--accent)',
};
