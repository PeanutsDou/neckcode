import { useState, useEffect } from 'react';

export function useStreamTimer(isStreaming: boolean, runStartedAt: number | null) {
  const [elapsed, setElapsed] = useState(0);

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

  return elapsed;
}
