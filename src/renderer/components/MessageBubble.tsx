import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { ChatEntry } from '../stores/chat-store';

interface Props {
  entry: ChatEntry;
}

export function MessageBubble({ entry }: Props) {
  if (entry.role === 'tool') {
    return (
      <div className="message message-tool">
        <div className="tool-header">
          <span className="tool-icon">&#x2699;</span>
          <span className="tool-name">{entry.toolName}</span>
          {entry.toolArgs && (
            <span className="tool-args">{entry.toolArgs.slice(0, 100)}</span>
          )}
        </div>
        {entry.toolResult && (
          <pre className="tool-result">{entry.toolResult.slice(0, 500)}</pre>
        )}
      </div>
    );
  }

  return (
    <div className={`message message-${entry.role}`}>
      <div className="message-role">
        {entry.role === 'user' ? 'You' : entry.role === 'system' ? 'System' : 'Assistant'}
      </div>
      <div className="message-content">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {entry.content}
        </ReactMarkdown>
      </div>
    </div>
  );
}
