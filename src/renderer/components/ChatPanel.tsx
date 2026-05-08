import React, { useRef, useEffect } from 'react';
import { useChatStore } from '../stores/chat-store';
import { ChatInput } from './ChatInput';
import { MessageBubble } from './MessageBubble';

export function ChatPanel() {
  const { entries, streamingText, isStreaming, error } = useChatStore();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [entries, streamingText]);

  return (
    <div className="chat-panel">
      <div className="chat-messages">
        {entries.length === 0 && !streamingText && (
          <div className="chat-empty">
            <h2>DeepSeek Code</h2>
            <p>输入你的问题开始对话</p>
          </div>
        )}

        {entries.map(entry => (
          <MessageBubble key={entry.id} entry={entry} />
        ))}

        {streamingText && (
          <div className="message message-assistant streaming">
            <div className="message-content">{streamingText}</div>
          </div>
        )}

        {isStreaming && !streamingText && (
          <div className="message message-assistant">
            <div className="typing-indicator">
              <span />
              <span />
              <span />
            </div>
          </div>
        )}

        {error && (
          <div className="message message-system error">
            <div className="message-content">Error: {error}</div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      <ChatInput />
    </div>
  );
}
