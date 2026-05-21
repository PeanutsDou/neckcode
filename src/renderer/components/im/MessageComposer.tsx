import React, { useState, useRef } from 'react';
import { useImStore } from '../../stores/im-store';

export function MessageComposer({ peerId }: { peerId: string }) {
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = () => {
    const content = text.trim();
    if (!content || content.length > 4000) return;

    window.electronAPI!.imSendMessage({ toUser: peerId, content });
    setText('');

    // 恢复焦点
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div style={{
      padding: '10px 12px', borderTop: '1px solid var(--border)',
      display: 'flex', gap: 8, alignItems: 'flex-end',
      background: 'var(--bg-secondary)',
    }}>
      <textarea
        ref={inputRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="输入消息... (Enter 发送, Shift+Enter 换行)"
        rows={1}
        style={{
          flex: 1, padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 6,
          background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: 13,
          outline: 'none', resize: 'none', maxHeight: 100,
          fontFamily: 'inherit',
        }}
      />
      <button onClick={handleSend}
        disabled={!text.trim() || text.length > 4000}
        style={{
          padding: '8px 16px', border: 'none', borderRadius: 6, cursor: text.trim() ? 'pointer' : 'not-allowed',
          background: text.trim() ? 'var(--accent)' : 'var(--bg-surface)',
          color: text.trim() ? '#fff' : 'var(--text-muted)', fontSize: 13,
          opacity: text.trim() ? 1 : 0.7,
          flexShrink: 0,
        }}
      >发送</button>
    </div>
  );
}
