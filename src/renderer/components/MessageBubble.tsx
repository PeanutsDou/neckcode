import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { ChatEntry } from '../stores/chat-store';
import { DiffPreview } from './DiffPreview';

interface Props {
  entry: ChatEntry;
}

export function MessageBubble({ entry }: Props) {
  if (entry.role === 'tool') {
    // Check if this is an edit_file diff result
    let diffData: { status: string; file: string; line: number; old: string; new: string } | null = null;
    if (entry.toolName === 'edit_file' && entry.toolResult) {
      try {
        const parsed = JSON.parse(entry.toolResult);
        if (parsed.status === 'modified') diffData = parsed;
      } catch { /* not JSON */ }
    }

    return (
      <div className="message message-tool">
        <div className="tool-header">
          <span className="tool-icon">&#x2699;</span>
          <span className="tool-name">{entry.toolName}</span>
          {entry.toolArgs && (
            <span className="tool-args">{entry.toolArgs.slice(0, 100)}</span>
          )}
        </div>
        {diffData ? (
          <DiffPreview data={diffData} />
        ) : entry.toolResult ? (
          <pre className="tool-result">{entry.toolResult.slice(0, 500)}</pre>
        ) : null}
      </div>
    );
  }

  return (
    <div className={`message message-${entry.role}`}>
      <div className="message-role">
        {entry.role === 'user' ? 'You' : entry.role === 'system' ? 'System' : 'Assistant'}
      </div>
      {entry.attachments && entry.attachments.length > 0 && (
        <div className="message-attachments">
          {entry.attachments.map((att, i) => (
            <img key={i} src={att.data} alt={att.name} className="message-attachment-img" />
          ))}
        </div>
      )}
      <div className="message-content">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {entry.content}
        </ReactMarkdown>
      </div>
    </div>
  );
}
