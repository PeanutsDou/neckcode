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
import { AgentDialog } from './components/AgentDialog';
import { WorkspaceBar } from './components/WorkspaceBar';
import { ImageViewer } from './components/ImageViewer';
import { CloseDialog } from './components/CloseDialog';
import { ImShell } from './components/im/ImShell';
import { ResizeHandle } from './components/ResizeHandle';
import { UpdateBanner } from './components/UpdateBanner';
import { useAppStore } from './stores/app-store';
import { LIGHT_SCHEMES, normalizeLightScheme, type LightSchemeId } from './theme-schemes';

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
  const { showSidebar, toggleSidebar, showSessions, leftWidth, setLeftWidth, theme, setTheme, lightScheme, setLightScheme } = useAppStore();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [skillsOpen, setSkillsOpen] = useState(false);
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [agentOpen, setAgentOpen] = useState(false);
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [viewerSrc, setViewerSrc] = useState<string | null>(null);
  const [version, setVersion] = useState('');
  const [codeLeftWidth, setCodeLeftWidth] = useState(() => 280);
  const handleCodeResize = (delta: number) => {
    setCodeLeftWidth(prev => {
      const next = Math.max(180, Math.min(window.innerWidth * 0.5, prev + delta));
      window.electronAPI?.setConfig('codeLeftWidth', next);
      return next;
    });
  };
  const [mainMode, setMainMode] = useState<'agent' | 'im'>('agent');
  const toolbarRef = React.useRef<HTMLDivElement>(null);
  const appearanceRef = React.useRef<HTMLDivElement>(null);

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
    document.documentElement.setAttribute('data-light-scheme', lightScheme);
  }, [theme, lightScheme]);

  useEffect(() => {
    if (!appearanceOpen) return;
    const close = (event: MouseEvent) => {
      if (!appearanceRef.current?.contains(event.target as Node)) {
        setAppearanceOpen(false);
      }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [appearanceOpen]);

  // Font scale via CSS variable
  const fontScale = useAppStore(s => s.fontScale);
  const setFontScale = useAppStore(s => s.setFontScale);
  useEffect(() => {
    document.documentElement.style.setProperty('--font-scale', `${fontScale / 100}`);
  }, [fontScale]);

  useEffect(() => {
    const openSettings = () => setSettingsOpen(true);
    window.addEventListener('open-settings', openSettings);
    return () => window.removeEventListener('open-settings', openSettings);
  }, []);

  // Load config-driven state
  useEffect(() => {
    const loadConfig = () => {
      window.electronAPI?.getConfig().then((c: any) => {
        useAppStore.getState().setTheme(c.theme || 'light');
        useAppStore.getState().setLightScheme(normalizeLightScheme(c.lightScheme));
        useAppStore.getState().setFontScale(c.fontScale || 100);
        useAppStore.getState().setModel(c.model);
        if (c.version) setVersion(c.version);
        useAppStore.getState().setAvailableModels(c.models || []);
        if (c.codeLeftWidth) setCodeLeftWidth(c.codeLeftWidth);
      }).catch(() => {});
    };
    loadConfig();
    const handler = () => loadConfig();
    window.addEventListener('providers-changed', handler);
    window.addEventListener('open-image-viewer', ((e: CustomEvent) => setViewerSrc(e.detail)) as EventListener);
    return () => window.removeEventListener('providers-changed', handler);
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

  const applyLightScheme = (scheme: LightSchemeId) => {
    setLightScheme(scheme);
    window.electronAPI?.setConfig('lightScheme', scheme).catch(() => {});
    setAppearanceOpen(false);
  };

  return (
    <ErrorBoundary>
      <div className="app-container">
        {/* Title bar */}
        <div className="toolbar" ref={toolbarRef}>
          <div className="toolbar-left">
            <img src="./icon.png" className="toolbar-icon" alt="" />
            <span className="toolbar-title">DeepSeek Code</span>
            <button className={'toolbar-btn' + (mainMode === 'agent' ? ' active' : '')} onClick={() => setMainMode('agent')} style={{ marginLeft: 12 }}>Agent</button>
            <button className={'toolbar-btn' + (mainMode === 'im' ? ' active' : '')} onClick={() => setMainMode('im')}>IM</button>
            <span className="toolbar-version" style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 8 }}>v{version}</span>
          </div>
          <div className="toolbar-center" />
          <div className="toolbar-right">
            <button className="toolbar-btn" onClick={() => setAgentOpen(true)}>
              Agent
            </button>
            <button className="toolbar-btn" onClick={() => setSkillsOpen(true)}>
              技能
            </button>
            <button className="toolbar-btn" onClick={() => setMemoryOpen(true)}>
              记忆
            </button>
            <button className="toolbar-btn" onClick={() => setSettingsOpen(true)}>
              设置
            </button>
            <div className="appearance-menu-wrap" ref={appearanceRef}>
              <button
                className={`toolbar-btn ${appearanceOpen ? 'active' : ''}`}
                onClick={() => setAppearanceOpen(v => !v)}
              >
                外观
              </button>
              {appearanceOpen && (
                <div className="appearance-menu">
                  <div className="appearance-menu-title">配色方案</div>
                  {theme === 'dark' ? (
                    <div className="appearance-menu-note">深色模式使用固定配色：夜蓝</div>
                  ) : (
                    <>
                      {LIGHT_SCHEMES.map(scheme => (
                        <button
                          key={scheme.id}
                          className={`appearance-option ${lightScheme === scheme.id ? 'active' : ''}`}
                          type="button"
                          onClick={() => applyLightScheme(scheme.id)}
                        >
                          <span className="appearance-swatch">
                            {scheme.palette.slice(0, 3).map(color => (
                              <i key={color} style={{ background: color }} />
                            ))}
                          </span>
                          <span>{scheme.name}</span>
                        </button>
                      ))}
                    </>
                  )}
                </div>
              )}
            </div>
            <button
              className="toolbar-btn"
              onClick={() => { const t = theme === 'dark' ? 'light' as const : 'dark' as const; setTheme(t); window.electronAPI?.setConfig('theme', t); }}
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
        {(() => {
          if (mainMode === 'im') {
            return <ImShell />;
          }
          if (showSidebar) {
            return (
              <div className="code-panel-full">
                <div className="code-panel-topbar">
                  <WorkspaceBar />
                  <button className="toolbar-btn code-panel-close" onClick={toggleSidebar} title="返回聊天">
                    <span style={{ fontSize: 18 }}>←</span>
                  </button>
                </div>
                <div className="code-panel-body">
                  <div className="code-panel-left" style={{ width: codeLeftWidth }}>
                    <FileTree />
                  </div>
                  <ResizeHandle direction="left" onResize={handleCodeResize} />
                  <div className="code-panel-right">
                    <EditorTabs />
                    <EditorPanel />
                  </div>
                </div>
              </div>
            );
          }
          return (
            <div className="main-content">
              {showSessions && (
                <>
                  <div className="sidebar-left" style={{ width: leftWidth }}>
                    <SessionList />
                    <div className="sidebar-left-bottom">
                      <UpdateBanner />
                      <ContextBar />
                    </div>
                  </div>
                  <ResizeHandle direction="left" onResize={setLeftWidth} />
                </>
              )}

              <div className="chat-main">
                <ChatPanel />
              </div>
            </div>
          );
        })()}

        <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
        <SkillsDialog open={skillsOpen} onClose={() => setSkillsOpen(false)} />
        <MemoryDialog open={memoryOpen} onClose={() => setMemoryOpen(false)} />
        <AgentDialog open={agentOpen} onClose={() => setAgentOpen(false)} />
        <ImageViewer open={!!viewerSrc} src={viewerSrc || ''} onClose={() => setViewerSrc(null)} />
        <CloseDialog />
        <AskDialog />
      </div>
    </ErrorBoundary>
  );
}
