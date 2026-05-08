import React, { Component, useState } from 'react';
import { ChatPanel } from './components/ChatPanel';
import { FileTree } from './components/FileTree';
import { EditorTabs } from './components/EditorTabs';
import { EditorPanel } from './components/EditorPanel';
import { ModelSwitcher } from './components/ModelSwitcher';
import { SessionList } from './components/SessionList';
import { SettingsDialog } from './components/SettingsDialog';
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
  const { showSidebar, toggleSidebar, showSessions, toggleSessions } = useAppStore();
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <ErrorBoundary>
      <div className="app-container">
        {/* Toolbar */}
        <div className="toolbar">
          <div className="toolbar-left">
            <button
              className={`toolbar-btn ${showSessions ? 'active' : ''}`}
              onClick={toggleSessions}
              title="Toggle sessions"
            >
              &#x1F4CB;
            </button>
            <span className="toolbar-title">DeepSeek Code</span>
          </div>
          <div className="toolbar-center">
            <ModelSwitcher />
          </div>
          <div className="toolbar-right">
            <button className="toolbar-btn" onClick={() => setSettingsOpen(true)} title="Settings">
              &#x2699;
            </button>
            <button
              className={`toolbar-btn ${showSidebar ? 'active' : ''}`}
              onClick={toggleSidebar}
              title="Toggle code panel"
            >
              &#x1F4C4;
            </button>
          </div>
        </div>

        {/* Main content */}
        <div className="main-content">
          {showSessions && (
            <div className="sidebar-left">
              <SessionList />
            </div>
          )}

          <div className="chat-main">
            <ChatPanel />
          </div>

          {showSidebar && (
            <div className="sidebar-right">
              <div className="sidebar-right-section">
                <FileTree />
              </div>
              <div className="sidebar-right-section editor-section">
                <EditorTabs />
                <EditorPanel />
              </div>
            </div>
          )}
        </div>

        <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      </div>
    </ErrorBoundary>
  );
}
