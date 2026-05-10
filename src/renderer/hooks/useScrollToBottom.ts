import { useRef, useEffect } from 'react';

export function useScrollToBottom(deps: {
  entries: unknown[];
  streamingText: string;
  thinkingText: string;
  isStreaming: boolean;
}) {
  const { entries, streamingText, thinkingText, isStreaming } = deps;
  const bottomRef = useRef<HTMLDivElement>(null);
  const wasStreaming = useRef(false);
  const userScrolledUp = useRef(false);

  // Detect user manually scrolling away from the bottom
  useEffect(() => {
    const container = bottomRef.current?.parentElement;
    if (!container) return;
    const handleWheel = (e: WheelEvent) => {
      if (e.deltaY < 0) {
        userScrolledUp.current = true;
      } else if (e.deltaY > 0) {
        const dist = container.scrollHeight - container.scrollTop - container.clientHeight;
        if (dist < 5) userScrolledUp.current = false;
      }
    };
    container.addEventListener('wheel', handleWheel, { passive: true });
    return () => container.removeEventListener('wheel', handleWheel);
  }, []);

  useEffect(() => {
    const container = bottomRef.current?.parentElement;
    if (!container) return;
    const runJustStarted = isStreaming && !wasStreaming.current;
    wasStreaming.current = isStreaming;
    if (runJustStarted) {
      userScrolledUp.current = false;
      bottomRef.current?.scrollIntoView({ behavior: 'auto' });
      return;
    }
    if (isStreaming && userScrolledUp.current) return;
    bottomRef.current?.scrollIntoView({ behavior: isStreaming ? 'auto' : 'smooth' });
  }, [entries, streamingText, thinkingText, isStreaming]);

  return bottomRef;
}
