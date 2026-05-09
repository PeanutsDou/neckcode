import React, { Component, useState, useEffect } from 'react';
import { ChatPanel } from './components/ChatPanel';
import { FileTree } from './components/FileTree';
import { EditorTabs } from './components/EditorTabs';
import { EditorPanel } from './components/EditorPanel';
import { SessionList } from './components/SessionList';
import { SettingsDialog } from './components/SettingsDialog';
import { ContextBar } from './components/ContextBar';
import { AskDialog } from './components/AskDialog';
import { SkillsDialog } from './components/SkillsDialog';
import { MemoryDialog } from './components/MemoryDialog';
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
  if (window.electronAPI?.maximize) {
    window.electronAPI.maximize();
  }
}

function handleClose() {
  window.electronAPI?.close?.();
}

export default function App() {
  const { showSidebar, toggleSidebar, showSessions, leftWidth, rightWidth, setLeftWidth, setRightWidth, theme, setTheme } = useAppStore();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [skillsOpen, setSkillsOpen] = useState(false);
  const [memoryOpen, setMemoryOpen] = useState(false);
  const toolbarRef = React.useRef<HTMLDivElement>(null);

  // Double-click entire toolbar area to maximize
  useEffect(() => {
    const el = toolbarRef.current;
    if (!el) return;
    const handler = () => {
      if (window.electronAPI?.maximize) window.electronAPI.maximize();
    };
    el.addEventListener('dblclick', handler);
    return () => el.removeEventListener('dblclick', handler);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // Font scale via CSS variable
  const fontScale = useAppStore(s => s.fontScale);
  const setFontScale = useAppStore(s => s.setFontScale);
  useEffect(() => {
    document.documentElement.style.setProperty('--font-scale', `${fontScale / 100}`);
  }, [fontScale]);

  // Load fontScale from config
  useEffect(() => {
    window.electronAPI?.getConfig().then((c: any) => {
      if (c.fontScale) useAppStore.getState().setFontScale(c.fontScale);
    }).catch(() => {});
  }, []);

  // Ctrl+Scroll to zoom
  useEffect(() => {
    const handler = (e: WheelEvent) => {
      if (e.ctrlKey) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -5 : 5;
        const newScale = useAppStore.getState().fontScale + delta;
        useAppStore.getState().setFontScale(newScale);
        window.electronAPI?.setConfig('fontScale', newScale).catch(() => {});
      }
    };
    document.addEventListener('wheel', handler, { passive: false });
    return () => document.removeEventListener('wheel', handler);
  }, []);

  return (
    <ErrorBoundary>
      <div className="app-container">
        {/* Title bar */}
        <div className="toolbar" ref={toolbarRef}>
          <div className="toolbar-left">
            <img src="./icon.png" className="toolbar-icon" alt="" />
            <span className="toolbar-title">DeepSeek Code</span>
          </div>
          <div className="toolbar-center" />
          <div className="toolbar-right">
            <button className="toolbar-btn" onClick={() => setSkillsOpen(true)}>
              技能
            </button>
            <button className="toolbar-btn" onClick={() => setMemoryOpen(true)}>
              记忆
            </button>
            <button className="toolbar-btn" onClick={() => setSettingsOpen(true)}>
              设置
            </button>
            <button
              className="toolbar-btn"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              title="切换主题"
            >
              {theme === 'dark' ? '☀' : '☾'}
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
        <SkillsDialog open={skillsOpen} onClose={() => setSkillsOpen(false)} />
        <MemoryDialog open={memoryOpen} onClose={() => setMemoryOpen(false)} />

        <AskDialog />
      </div>
    </ErrorBoundary>
  );
}
