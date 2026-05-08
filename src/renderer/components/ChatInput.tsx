import React, { useState, useRef } from 'react';
import { useChatStore } from '../stores/chat-store';

export function ChatInput() {
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const { addEntry, setStreaming, isStreaming, abort } = useChatStore();

  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed || isStreaming) return;

    addEntry({
      id: Date.now().toString(),
      role: 'user',
      content: trimmed,
      timestamp: Date.now(),
    });

    setText('');
    setStreaming(true);

    try {
      if (window.electronAPI) {
        await window.electronAPI.sendMessage(trimmed);
      } else {
        useChatStore.getState().setError('electronAPI not available');
      }
    } catch (err) {
      useChatStore.getState().setError(
        err instanceof Error ? err.message : String(err),
      );
    }
  };

  const handleStop = () => {
    if (window.electronAPI) {
      window.electronAPI.abort();
    }
    useChatStore.getState().setStreaming(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="chat-input-area">
      <textarea
        ref={inputRef}
        className="chat-input"
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="输入消息 (Enter 发送, Shift+Enter 换行)"
        rows={3}
        disabled={isStreaming}
      />
      <div className="chat-input-actions">
        {isStreaming ? (
          <button className="btn btn-stop" onClick={handleStop}>
            Stop
          </button>
        ) : (
          <button className="btn btn-send" onClick={handleSend} disabled={!text.trim()}>
            Send
          </button>
        )}
      </div>
    </div>
  );
}
