import React, { Component, useState } from 'react';
import { ChatPanel } from './components/ChatPanel';
import { FileTree } from './components/FileTree';
import { EditorTabs } from './components/EditorTabs';
import { EditorPanel } from './components/EditorPanel';
import { SessionList } from './components/SessionList';
import { SettingsDialog } from './components/SettingsDialog';
import { ContextBar } from './components/ContextBar';
import { TerminalPanel } from './components/TerminalPanel';
import { ModelCompare } from './components/ModelCompare';
import { ResizeHandle } from './components/ResizeHandle';
import { useAppStore } from './stores/app-store';

class ErrorBoundary extends Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 40, color: '#b87070', fontFamily: 'monospace' }}>
          <h2>App Error</h2>
          <pre>{this.state.error.message}</pre>
          <pre>{this.state.error.stack}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

function handleMinimize() {
  window.electronAPI?.minimize?.();
}

function handleMaximize() {
  window.electronAPI?.maximize?.();
}

function handleClose() {
  window.electronAPI?.close?.();
}

export default function App() {
  const { showSidebar, toggleSidebar, showSessions, showTerminal, toggleTerminal, leftWidth, rightWidth, setLeftWidth, setRightWidth } = useAppStore();
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <ErrorBoundary>
      <div className="app-container">
        {/* Title bar */}
        <div className="toolbar">
          <div className="toolbar-left">
            <span className="toolbar-title">DeepSeek Code</span>
          </div>
          <div className="toolbar-center" />
          <div className="toolbar-right">
            <button
              className={`toolbar-btn ${showTerminal ? 'active' : ''}`}
              onClick={toggleTerminal}
            >
              终端
            </button>
            <ModelCompare />
            <button className="toolbar-btn" onClick={() => setSettingsOpen(true)}>
              设置
            </button>
            <button
              className={`toolbar-btn icon-btn ${showSidebar ? 'active' : ''}`}
              onClick={toggleSidebar}
              title="代码面板"
            >
              <span className="icon-lines">
                <i /><i /><i />
              </span>
            </button>
            <div className="window-controls">
              <button className="window-btn" onClick={handleMinimize}>—</button>
              <button className="window-btn" onClick={handleMaximize}>□</button>
              <button className="window-btn close" onClick={handleClose}>×</button>
            </div>
          </div>
        </div>

        {/* Main content */}
        <div className="main-content">
          {showSessions && (
            <>
              <div className="sidebar-left" style={{ width: leftWidth }}>
                <SessionList />
                <div className="sidebar-left-bottom">
                  <ContextBar />
                </div>
              </div>
              <ResizeHandle direction="left" onResize={setLeftWidth} />
            </>
          )}

          <div className="chat-main">
            <ChatPanel />
          </div>

          {showSidebar && (
            <>
              <ResizeHandle direction="right" onResize={setRightWidth} />
              <div className="sidebar-right" style={{ width: rightWidth, minWidth: 300, maxWidth: 800 }}>
                <div className="sidebar-right-section">
                  <FileTree />
                </div>
                <div className="sidebar-right-section editor-section">
                  <EditorTabs />
                  <EditorPanel />
                </div>
              </div>
            </>
          )}
        </div>

        <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />

        {showTerminal && (
          <div className="terminal-area">
            <TerminalPanel visible={showTerminal} />
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
}
