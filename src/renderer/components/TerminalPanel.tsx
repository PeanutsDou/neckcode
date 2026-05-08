import React, { useEffect, useRef } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from '@xterm/addon-fit';
import 'xterm/css/xterm.css';

interface Props {
  visible: boolean;
}

export function TerminalPanel({ visible }: Props) {
  const termRef = useRef<HTMLDivElement>(null);
  const term = useRef<Terminal | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!visible || !termRef.current) return;

    const t = new Terminal({
      fontSize: 13,
      fontFamily: "'Cascadia Code', 'Fira Code', Consolas, monospace",
      theme: {
        background: '#181825',
        foreground: '#cdd6f4',
        cursor: '#89b4fa',
      },
      cursorBlink: true,
    });

    const fit = new FitAddon();
    t.loadAddon(fit);
    t.open(termRef.current);
    fit.fit();

    // Try connecting to a local shell via WebSocket (future enhancement)
    // For now, just show a welcome message
    t.writeln('\x1b[1;34m=== Terminal ===\x1b[0m');
    t.writeln('AI shell commands will appear here in real-time.');
    t.writeln('');

    term.current = t;

    return () => {
      t.dispose();
      term.current = null;
    };
  }, [visible]);

  if (!visible) return null;

  return (
    <div className="terminal-panel">
      <div ref={termRef} className="terminal-container" />
    </div>
  );
}
