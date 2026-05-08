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

    term.current = t;

    // Start shell
    window.electronAPI.startTerminal().catch(() => {});

    // Listen for shell output
    const unsub = window.electronAPI.onTerminalData((data: string) => {
      t.write(data);
    });

    // Send user input to shell
    t.onData((data) => {
      window.electronAPI.writeTerminal(data).catch(() => {});
    });

    return () => {
      unsub();
      window.electronAPI.stopTerminal().catch(() => {});
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
