import { useRef, useEffect } from 'react';

const sessionScrollPositions = new Map<string, number>();

export function useScrollToBottom(deps: {
  entries: unknown[];
  streamingText: string;
  thinkingText: string;
  isStreaming: boolean;
  sessionId: string;
}) {
  const { entries, streamingText, thinkingText, isStreaming, sessionId } = deps;
  const bottomRef = useRef<HTMLDivElement>(null);
  const wasStreaming = useRef(false);
  const userScrolledUp = useRef(false);
  const prevSessionId = useRef(sessionId);
  const restoredRef = useRef(false);

  // ── Continuously track scroll position ──
  useEffect(() => {
    const container = bottomRef.current?.parentElement;
    if (!container) return;

    const handleScroll = () => {
      sessionScrollPositions.set(sessionId, container.scrollTop);
      // Detect if user scrolled away from bottom
      const dist = container.scrollHeight - container.scrollTop - container.clientHeight;
      if (dist > 5) userScrolledUp.current = true;
      else userScrolledUp.current = false;
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, [sessionId]);

  // ── Restore on session switch ──
  useEffect(() => {
    if (sessionId !== prevSessionId.current) {
      prevSessionId.current = sessionId;
      restoredRef.current = false;
      userScrolledUp.current = false;
    }

    const container = bottomRef.current?.parentElement;
    if (!container) return;

    if (!restoredRef.current && !isStreaming) {
      const saved = sessionScrollPositions.get(sessionId);
      if (saved !== undefined && saved > 0 && saved < container.scrollHeight) {
        container.scrollTo({ top: saved, behavior: 'auto' });
      } else {
        bottomRef.current?.scrollIntoView({ behavior: 'auto' });
      }
      restoredRef.current = true;
    }
  }, [entries, sessionId, isStreaming]);

  // ── Auto-scroll during streaming ──
  useEffect(() => {
    const runJustStarted = isStreaming && !wasStreaming.current;
    wasStreaming.current = isStreaming;

    if (runJustStarted) {
      userScrolledUp.current = false;
      restoredRef.current = true;
      bottomRef.current?.scrollIntoView({ behavior: 'auto' });
      return;
    }

    if (isStreaming && !userScrolledUp.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'auto' });
    }
  }, [streamingText, thinkingText, isStreaming]);

  return bottomRef;
}
