import React, { useRef, useEffect } from 'react';
import { useChatStore } from '../stores/chat-store';
import { ChatInput } from './ChatInput';
import { MessageBubble } from './MessageBubble';

export function ChatPanel() {
  const { entries, streamingText, isStreaming, error,
          addEntry, appendDelta, finishStream, setStreaming, setError } = useChatStore();
  const bottomRef = useRef<HTMLDivElement>(null);

  // Set up IPC event listeners
  useEffect(() => {
    const api = window.electronAPI;
    if (!api) return;

    const unsubs: Array<() => void> = [];

    unsubs.push(api.onDelta((text) => appendDelta(text)));
    unsubs.push(api.onToolStart((data: any) => {
      addEntry({
        id: Date.now().toString(),
        role: 'tool',
        content: `Calling ${data.name}...`,
        toolName: data.name,
        toolArgs: data.argumentsText,
        timestamp: Date.now(),
      });
    }));
    unsubs.push(api.onToolResult((data: any) => {
      addEntry({
        id: Date.now().toString(),
        role: 'tool',
        content: data.result,
        toolName: data.name,
        toolResult: data.result,
        timestamp: Date.now(),
      });
    }));
    unsubs.push(api.onTurnDone((data: any) => {
      finishStream(data.text);
    }));
    unsubs.push(api.onError((msg) => setError(msg)));

    return () => { unsubs.forEach(fn => fn()); };
  }, []);

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
