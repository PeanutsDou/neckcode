import React, { useRef, useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  useChatStore,
  useActiveEntries,
  useActiveStreamingText,
  useActiveIsStreaming,
  useActiveRunStartedAt,
  useActiveError,
  type ChatEntry,
} from '../stores/chat-store';
import { ChatInput } from './ChatInput';
import { MessageBubble } from './MessageBubble';
import { MermaidBlock } from './MermaidBlock';

function estimateTokens(text: string): number {
  let cjk = 0;
  let ascii = 0;
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    if (
      (code >= 0x4E00 && code <= 0x9FFF) ||
      (code >= 0x3400 && code <= 0x4DBF) ||
      (code >= 0x3000 && code <= 0x303F) ||
      (code >= 0xFF00 && code <= 0xFFEF) ||
      (code >= 0xAC00 && code <= 0xD7AF) ||
      code > 127
    ) {
      cjk++;
    } else {
      ascii++;
    }
  }
  return Math.round(cjk * 0.7 + ascii * 0.25);
}

function estimateCurrentRunTokens(entries: ChatEntry[], streamingText: string): number {
  let start = -1;
  for (let i = entries.length - 1; i >= 0; i--) {
    if (entries[i].role === 'user') {
      start = i;
      break;
    }
  }

  const inputEntries = start >= 0 ? entries.slice(start, start + 1) : [];
  const outputEntries = start >= 0 ? entries.slice(start + 1) : [];
  let text = '';

  for (const entry of inputEntries) {
    text += entry.content;
    text += entry.toolArgs || '';
    text += entry.toolResult || '';
  }

  for (const entry of outputEntries) {
    if (entry.role === 'assistant') text += entry.content;
    if (entry.role === 'tool') {
      text += entry.toolArgs || '';
      text += entry.toolResult || entry.content || '';
    }
  }

  text += streamingText;
  return estimateTokens(text);
}

function fmtTokens(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function fmtTime(sec: number): string {
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${s}s`;
}

export function ChatPanel() {
  const store = useChatStore;
  const entries = useActiveEntries();
  const streamingText = useActiveStreamingText();
  const isStreaming = useActiveIsStreaming();
  const runStartedAt = useActiveRunStartedAt();
  const error = useActiveError();
  const bottomRef = useRef<HTMLDivElement>(null);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const api = window.electronAPI;
    if (!api) return;

    const unsubs: Array<() => void> = [];

    unsubs.push(api.onDelta((sid, text) => {
      store.getState().appendDeltaTo(sid, text);
    }));
    unsubs.push(api.onToolStart((sid, data: any) => {
      store.getState().addEntryTo(sid, {
        id: `tool_${Date.now()}`,
        role: 'tool',
        content: '',
        toolName: data.name,
        toolArgs: data.argumentsText,
        timestamp: Date.now(),
      });
    }));
    unsubs.push(api.onToolResult((sid, data: any) => {
      const state = store.getState();
      const ses = state.sessions[sid];
      if (ses) {
        const entries = [...ses.entries];
        for (let i = entries.length - 1; i >= 0; i--) {
          if (entries[i].role === 'tool' && entries[i].toolName === data.name && !entries[i].toolResult) {
            entries[i] = { ...entries[i], content: data.result, toolResult: data.result };
            break;
          }
        }
        store.setState({ sessions: { ...state.sessions, [sid]: { ...ses, entries } } });
      }
    }));
    unsubs.push(api.onTurnDone((sid, data: any) => {
      store.getState().finishStreamTo(sid, data.text);
    }));
    unsubs.push(api.onError((sid, msg) => {
      store.getState().setErrorTo(sid, msg);
    }));

    return () => { unsubs.forEach(fn => fn()); };
  }, []);

  useEffect(() => {
    if (!isStreaming || !runStartedAt) {
      setElapsed(0);
      return;
    }

    const updateElapsed = () => setElapsed(Math.max(0, Math.floor((Date.now() - runStartedAt) / 1000)));
    updateElapsed();
    const timer = setInterval(updateElapsed, 1000);
    return () => clearInterval(timer);
  }, [isStreaming, runStartedAt]);

  const tokens = isStreaming ? estimateCurrentRunTokens(entries, streamingText) : 0;
  const streamMetric = `${fmtTime(elapsed)} · ↓ ${fmtTokens(tokens)} tokens`;

  useEffect(() => {
    const container = bottomRef.current?.parentElement;
    if (!container) return;
    // Only auto-scroll if user is near the bottom
    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 80;
    if (isNearBottom || !isStreaming) {
      bottomRef.current?.scrollIntoView({ behavior: isStreaming ? 'auto' : 'smooth' });
    }
  }, [entries, streamingText, isStreaming]);

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

        {isStreaming && streamingText && (
          <div className="message message-assistant streaming">
            <div className="streaming-head">
              <span className="streaming-spark" />
              <div className="streaming-status">{streamMetric}</div>
            </div>
            <div className="message-content">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  code({ className, children, ...props }) {
                    const match = /language-(\w+)/.exec(className || '');
                    const lang = match?.[1];
                    const code = String(children).replace(/\n$/, '');
                    if (lang === 'mermaid') {
                      return <MermaidBlock code={code} />;
                    }
                    if (className) {
                      return <pre><code className={className} {...props}>{children}</code></pre>;
                    }
                    return <code {...props}>{children}</code>;
                  },
                }}
              >
                {streamingText}
              </ReactMarkdown>
            </div>
          </div>
        )}

        {isStreaming && !streamingText && (
          <div className="message message-assistant streaming">
            <div className="streaming-head">
              <span className="streaming-spark" />
              <div className="streaming-status">{streamMetric}</div>
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
