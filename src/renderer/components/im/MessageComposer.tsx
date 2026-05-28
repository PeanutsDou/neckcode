import React, { useRef, useState } from 'react';
import { useImStore } from '../../stores/im-store';
import type { ImMessageAttachment } from '../../../shared/im-types';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

function fileToAttachment(file: File): Promise<ImMessageAttachment | null> {
  if (!ALLOWED_IMAGE_TYPES.has(file.type) || file.size > MAX_IMAGE_BYTES) return Promise.resolve(null);
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve({
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      type: 'image',
      data: String(reader.result || ''),
      mimeType: file.type,
      name: file.name,
      size: file.size,
    });
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

export function MessageComposer({ peerId }: { peerId: string }) {
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState<ImMessageAttachment[]>([]);
  const [notice, setNotice] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const connectionState = useImStore((s) => s.connectionState);
  const loggedIn = useImStore((s) => s.authState.status === 'loggedIn');

  const content = text.trim();
  const tooLong = text.length > 4000;
  const canSend = (Boolean(content) || attachments.length > 0) && !tooLong && loggedIn;
  const offline = connectionState !== 'online';

  const addFiles = async (files: FileList | File[]) => {
    const next: ImMessageAttachment[] = [];
    for (const file of Array.from(files)) {
      const attachment = await fileToAttachment(file);
      if (attachment) next.push(attachment);
    }
    if (next.length === 0) {
      setNotice('Only PNG, JPEG, WebP, and GIF images up to 5 MB are supported.');
      return;
    }
    setNotice('');
    setAttachments((prev) => [...prev, ...next].slice(0, 4));
  };

  const handleSend = () => {
    if (!canSend) return;
    window.electronAPI!.imSendMessage({ toUser: peerId, content, attachments });
    setText('');
    setAttachments([]);
    setNotice('');
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handlePaste = (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const files = Array.from(event.clipboardData.files).filter((file) => file.type.startsWith('image/'));
    if (files.length === 0) return;
    event.preventDefault();
    void addFiles(files);
  };

  return (
    <div style={containerStyle}>
      <div style={{ flex: 1, minWidth: 0 }}>
        {attachments.length > 0 && (
          <div style={previewRowStyle}>
            {attachments.map((item) => (
              <div key={item.id || item.data.slice(0, 32)} style={previewItemStyle}>
                <img src={item.data} alt="" style={previewImageStyle} />
                <button
                  type="button"
                  onClick={() => setAttachments((prev) => prev.filter((x) => x !== item))}
                  style={removeButtonStyle}
                  title="Remove image"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
        <textarea
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder={offline ? 'Offline messages will send after reconnecting' : 'Type a message. Paste an image to attach it.'}
          rows={1}
          style={textareaStyle}
        />
        {(offline || tooLong || text.length > 3600 || notice) && (
          <div style={{ color: tooLong ? 'var(--error)' : 'var(--text-muted)', fontSize: 11, marginTop: 4, textAlign: 'right' }}>
            {notice || (offline ? 'Offline cache enabled' : `${text.length} / 4000`)}
          </div>
        )}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        multiple
        style={{ display: 'none' }}
        onChange={(event) => {
          if (event.target.files) void addFiles(event.target.files);
          event.target.value = '';
        }}
      />
      <button type="button" onClick={() => fileRef.current?.click()} style={iconButtonStyle} title="Attach image">▧</button>
      <button onClick={handleSend} disabled={!canSend} style={buttonStyle(canSend)}>Send</button>
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
  borderRadius: 8,
  background: 'var(--bg-primary)',
  color: 'var(--text-primary)',
  fontSize: 13,
  outline: 'none',
  resize: 'vertical',
  fontFamily: 'inherit',
  boxSizing: 'border-box',
};

const previewRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: 8,
  marginBottom: 8,
  overflowX: 'auto',
};

const previewItemStyle: React.CSSProperties = {
  position: 'relative',
  width: 54,
  height: 54,
  borderRadius: 8,
  overflow: 'hidden',
  border: '1px solid var(--border)',
  flexShrink: 0,
};

const previewImageStyle: React.CSSProperties = {
  width: '100%',
  height: '100%',
  objectFit: 'cover',
  display: 'block',
};

const removeButtonStyle: React.CSSProperties = {
  position: 'absolute',
  top: 3,
  right: 3,
  width: 18,
  height: 18,
  border: 'none',
  borderRadius: 9,
  background: 'rgba(0,0,0,0.62)',
  color: '#fff',
  cursor: 'pointer',
  lineHeight: '18px',
  padding: 0,
};

const iconButtonStyle: React.CSSProperties = {
  width: 38,
  height: 38,
  border: '1px solid var(--border)',
  borderRadius: 8,
  cursor: 'pointer',
  background: 'var(--bg-surface)',
  color: 'var(--text-secondary)',
  fontSize: 18,
  flexShrink: 0,
};

const buttonStyle = (enabled: boolean): React.CSSProperties => ({
  padding: '9px 16px',
  border: `1px solid ${enabled ? 'var(--accent)' : 'var(--border)'}`,
  borderRadius: 8,
  cursor: enabled ? 'pointer' : 'not-allowed',
  background: enabled ? 'var(--accent)' : 'var(--bg-surface)',
  color: enabled ? '#fff' : 'var(--text-muted)',
  fontSize: 13,
  flexShrink: 0,
});
