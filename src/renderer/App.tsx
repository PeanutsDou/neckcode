import React, { useEffect, Component } from 'react';
import { useChatStore } from './stores/chat-store';
import { ChatPanel } from './components/ChatPanel';

class ErrorBoundary extends Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 40, color: '#f38ba8', fontFamily: 'monospace' }}>
          <h2>App Error</h2>
          <pre>{this.state.error.message}</pre>
          <pre>{this.state.error.stack}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  const { addEntry, appendDelta, finishStream, setStreaming, setError } = useChatStore();

  useEffect(() => {
    const api = window.electronAPI;
    if (!api) {
      console.warn('electronAPI not available (running outside Electron?)');
      return;
    }

    const unsubs: Array<() => void> = [];

    unsubs.push(
      api.onDelta((text) => {
        appendDelta(text);
      }),
    );

    unsubs.push(
      api.onToolStart((data) => {
        addEntry({
          id: Date.now().toString(),
          role: 'tool',
          content: `Calling ${data.name}...`,
          toolName: data.name,
          toolArgs: data.argumentsText,
          timestamp: Date.now(),
        });
      }),
    );

    unsubs.push(
      api.onToolResult((data) => {
        addEntry({
          id: Date.now().toString(),
          role: 'tool',
          content: data.result,
          toolName: data.name,
          toolResult: data.result,
          timestamp: Date.now(),
        });
      }),
    );

    unsubs.push(
      api.onTurnDone((data) => {
        finishStream(data.text);
      }),
    );

    unsubs.push(
      api.onError((msg) => {
        setError(msg);
      }),
    );

    return () => {
      unsubs.forEach(fn => fn());
    };
  }, []);

  return (
    <ErrorBoundary>
      <div className="app-container">
        <ChatPanel />
      </div>
    </ErrorBoundary>
  );
}
