import React, { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkBreaks from 'remark-breaks';
import { useChatStore } from '../stores/chat-store';

interface Props {
  sessionId: string;
  streamMetric: string;
}

export function StreamingBubble({ sessionId, streamMetric }: Props) {
  const statusRef = useRef<HTMLDivElement>(null);
  const [previewText, setPreviewText] = useState('');
  const lastPreview = useRef('');

  // Direct DOM update for status bar — zero React cost
  useEffect(() => {
    if (statusRef.current) statusRef.current.textContent = streamMetric;
  });

  // Subscribe to streaming text for progress preview
  useEffect(() => {
    const unsub = useChatStore.subscribe((state) => {
      const ses = state.sessions[sessionId];
      if (!ses?.isStreaming) return;
      const text = ses.streamingText;
      if (text === lastPreview.current) return;
      lastPreview.current = text;
      // Show last 3 non-empty lines as progress
      const lines = text.split('\n').filter(l => l.trim());
      setPreviewText(lines.slice(-3).join('\n'));
    });
    return () => unsub();
  }, [sessionId]);

  return (
    <div className="message message-assistant streaming">
      <div className="streaming-head">
        <span className="streaming-spark" />
        <div ref={statusRef} className="streaming-status">{streamMetric}</div>
      </div>
      {previewText && (
        <div className="message-content">
          <ReactMarkdown remarkPlugins={[remarkBreaks]}>
            {previewText}
          </ReactMarkdown>
        </div>
      )}
    </div>
  );
}
