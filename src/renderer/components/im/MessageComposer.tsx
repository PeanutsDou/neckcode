import React, { useRef, useState } from 'react';
import { useImStore } from '../../stores/im-store';

export function MessageComposer({ peerId }: { peerId: string }) {
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const connectionState = useImStore((s) => s.connectionState);
  const loggedIn = useImStore((s) => s.authState.status === 'loggedIn');

  const content = text.trim();
  const tooLong = text.length > 4000;
  const canSend = Boolean(content) && !tooLong && loggedIn;
  const offline = connectionState !== 'online';

  const handleSend = () => {
    if (!canSend) return;
    window.electronAPI!.imSendMessage({ toUser: peerId, content });
    setText('');
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div style={containerStyle}>
      <div style={{ flex: 1 }}>
        <textarea
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={offline ? '离线消息会先保存在本地，重连后自动发送' : '输入消息，Enter 发送，Shift+Enter 换行'}
          rows={1}
          style={textareaStyle}
        />
        {(offline || tooLong || text.length > 3600) && (
          <div style={{ color: tooLong ? 'var(--error)' : 'var(--text-muted)', fontSize: 11, marginTop: 4, textAlign: 'right' }}>
            {offline ? '离线缓存发送' : `${text.length} / 4000`}
          </div>
        )}
      </div>
      <button onClick={handleSend} disabled={!canSend} style={buttonStyle(canSend)}>发送</button>
    </div>
  );
}

const containerStyle: React.CSSProperties = {
  padding: '10px 12px',
  borderTop: '1px solid var(--border)',
  display: 'flex',
  gap: 8,
  alignItems: 'flex-end',
  background: 'var(--bg-secondary)',
};

const textareaStyle: React.CSSProperties = {
  width: '100%',
  minHeight: 38,
  maxHeight: 120,
  padding: '9px 10px',
  border: '1px solid var(--border)',
  borderRadius: 10,
  background: 'var(--bg-primary)',
  color: 'var(--text-primary)',
  fontSize: 13,
  outline: 'none',
  resize: 'vertical',
  fontFamily: 'inherit',
  boxSizing: 'border-box',
};

const buttonStyle = (enabled: boolean): React.CSSProperties => ({
  padding: '9px 16px',
  border: `1px solid ${enabled ? 'var(--accent)' : 'var(--border)'}`,
  borderRadius: 10,
  cursor: enabled ? 'pointer' : 'not-allowed',
  background: enabled ? 'var(--accent)' : 'var(--bg-surface)',
  color: enabled ? '#fff' : 'var(--text-muted)',
  fontSize: 13,
  flexShrink: 0,
});
