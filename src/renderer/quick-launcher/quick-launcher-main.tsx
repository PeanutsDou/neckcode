import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './quick-launcher.css';

type LauncherMode = 'chat' | 'find';
type QuickRole = 'user' | 'assistant' | 'tool';

interface QuickEntry {
  id: string;
  role: QuickRole;
  content: string;
  timestamp: number;
  toolCallId?: string;
  toolName?: string;
  toolArgs?: string;
  toolResult?: string;
}

interface RunStatus {
  phase?: string;
  currentTool?: string | null;
}

interface QuickFindResult {
  id?: string;
  path: string;
  name: string;
  isDir?: boolean;
  score: number;
  source?: string;
  mtimeMs?: number;
}

declare global {
  interface Window {
    electronAPI?: {
      quickLauncherHide?: () => Promise<void>;
      quickLauncherGetState?: () => Promise<{ mode: LauncherMode; inputAutoHideMs: number; panelAutoHideMs: number }>;
      quickLauncherSetMode?: (mode: LauncherMode) => Promise<void>;
      quickLauncherSetExpanded?: (expanded: boolean) => Promise<void>;
      onQuickLauncherShow?: (cb: () => void) => () => void;
      onQuickLauncherHide?: (cb: () => void) => () => void;
      quickChatSend?: (message: string) => Promise<{ ok?: boolean; error?: string }>;
      quickChatAbort?: () => Promise<void>;
      quickChatClear?: () => Promise<void>;
      quickChatSaveSession?: () => Promise<{ ok?: boolean; sessionId?: string; error?: string }>;
      onQuickChatUser?: (cb: (entry: QuickEntry) => void) => () => void;
      onQuickChatDelta?: (cb: (text: string) => void) => () => void;
      onQuickChatDone?: (cb: (data: { text?: string }) => void) => () => void;
      onQuickChatRunStatus?: (cb: (status: RunStatus) => void) => () => void;
      onQuickChatToolStart?: (cb: (entry: QuickEntry) => void) => () => void;
      onQuickChatToolResult?: (cb: (data: { toolCallId?: string; result?: string }) => void) => () => void;
      onQuickChatError?: (cb: (error: { message?: string; suggestion?: string }) => void) => () => void;
      onQuickChatCleared?: (cb: () => void) => () => void;
      onQuickChatSaved?: (cb: (data: { sessionId?: string }) => void) => () => void;
      quickFindLocalSearch?: (query: string) => Promise<QuickFindResult[]>;
      quickFindAgentSearch?: (query: string) => Promise<QuickFindResult[]>;
      quickFindOpen?: (path: string, reveal?: boolean) => Promise<{ ok?: boolean; error?: string }>;
    };
  }
}

function phaseText(status: RunStatus, loading: boolean): string {
  if (!loading && (!status.phase || status.phase === 'idle')) return '';
  if (status.phase === 'requesting_model') return '请求模型中';
  if (status.phase === 'thinking') return '正在思考';
  if (status.phase === 'streaming') return '正在输出';
  if (status.phase === 'tool_running') return `正在运行工具${status.currentTool ? ` · ${status.currentTool}` : ''}`;
  if (status.phase === 'finishing') return '正在收尾';
  if (status.phase === 'aborted') return '已中断';
  if (status.phase === 'error') return '出错';
  return loading ? '处理中' : '';
}

function findResultType(result: QuickFindResult): '文件' | '目录' {
  return result.isDir ? '目录' : '文件';
}

function findResultReason(result: QuickFindResult): string {
  if (result.source === 'workspace') return '工作区';
  if (result.source === 'desktop') return '桌面';
  if (result.source === 'downloads') return '下载';
  if (result.source === 'documents') return '文档';
  return `${Math.round(result.score)} 分`;
}

function QuickLauncherApp() {
  const [mode, setMode] = useState<LauncherMode>('chat');
  const [input, setInput] = useState('');
  const [visible, setVisible] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [inputAutoHideMs, setInputAutoHideMs] = useState(5000);
  const [panelAutoHideMs, setPanelAutoHideMs] = useState(10000);
  const [entries, setEntries] = useState<QuickEntry[]>([]);
  const [streamingText, setStreamingText] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<RunStatus>({});
  const [notice, setNotice] = useState('');
  const [findResults, setFindResults] = useState<QuickFindResult[]>([]);
  const [findLoading, setFindLoading] = useState(false);
  const [selectedFindIndex, setSelectedFindIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const hideTimerRef = useRef<number | null>(null);
  const noticeTimerRef = useRef<number | null>(null);
  const visibleRef = useRef(false);

  const hide = useCallback(() => {
    if (!visibleRef.current) return;
    visibleRef.current = false;
    setVisible(false);
    window.setTimeout(() => {
      window.electronAPI?.quickLauncherHide?.();
    }, 150);
  }, []);

  const resetAutoHide = useCallback(() => {
    if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    const delay = expanded ? panelAutoHideMs : inputAutoHideMs;
    hideTimerRef.current = window.setTimeout(() => {
      if (mode === 'find' && findResults.length > 0) return;
      if (!loading) hide();
    }, delay);
  }, [expanded, findResults.length, hide, inputAutoHideMs, loading, mode, panelAutoHideMs]);

  const show = useCallback(() => {
    visibleRef.current = true;
    setVisible(true);
    window.setTimeout(() => inputRef.current?.focus(), 30);
    resetAutoHide();
  }, [resetAutoHide]);

  const noteActivity = useCallback(() => {
    if (visibleRef.current) resetAutoHide();
  }, [resetAutoHide]);

  const showNotice = useCallback((text: string) => {
    setNotice(text);
    if (noticeTimerRef.current) window.clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = window.setTimeout(() => setNotice(''), 2600);
    noteActivity();
  }, [noteActivity]);

  const setExpandedMode = useCallback((next: boolean) => {
    setExpanded(next);
    window.electronAPI?.quickLauncherSetExpanded?.(next).catch(() => {});
  }, []);

  const switchMode = useCallback((next: LauncherMode) => {
    setMode(next);
    window.electronAPI?.quickLauncherSetMode?.(next).catch(() => {});
    setSelectedFindIndex(0);
    noteActivity();
  }, [noteActivity]);

  useEffect(() => {
    window.electronAPI?.quickLauncherGetState?.()
      .then(state => {
        if (state?.mode === 'chat' || state?.mode === 'find') setMode(state.mode);
        if (typeof state?.inputAutoHideMs === 'number') setInputAutoHideMs(state.inputAutoHideMs);
        if (typeof state?.panelAutoHideMs === 'number') setPanelAutoHideMs(state.panelAutoHideMs);
      })
      .catch(() => {});

    const api = window.electronAPI;
    const unsubs = [
      api?.onQuickLauncherShow?.(show),
      api?.onQuickLauncherHide?.(() => { visibleRef.current = false; setVisible(false); }),
      api?.onQuickChatUser?.((entry) => {
        setExpandedMode(true);
        setEntries(prev => [...prev, entry]);
      }),
      api?.onQuickChatDelta?.((text) => {
        setLoading(true);
        setStreamingText(prev => prev + text);
      }),
      api?.onQuickChatDone?.((data) => {
        setEntries(prev => [...prev, {
          id: `assistant_${Date.now()}`,
          role: 'assistant',
          content: data?.text || '',
          timestamp: Date.now(),
        }]);
        setStreamingText('');
        setLoading(false);
        setStatus({ phase: 'idle' });
      }),
      api?.onQuickChatRunStatus?.((next) => {
        setStatus(next || {});
        if (next?.phase && !['idle', 'finishing', 'aborted', 'error'].includes(next.phase)) setLoading(true);
        if (next?.phase === 'aborted' || next?.phase === 'error') setLoading(false);
      }),
      api?.onQuickChatToolStart?.((entry) => {
        setExpandedMode(true);
        setEntries(prev => [...prev, entry]);
      }),
      api?.onQuickChatToolResult?.((data) => {
        setEntries(prev => prev.map(entry => entry.toolCallId && entry.toolCallId === data.toolCallId
          ? { ...entry, content: data.result || '', toolResult: data.result || '' }
          : entry));
      }),
      api?.onQuickChatError?.((error) => {
        setLoading(false);
        setStreamingText('');
        showNotice(error?.message || 'Quick Chat 执行失败');
      }),
      api?.onQuickChatCleared?.(() => {
        setEntries([]);
        setStreamingText('');
        setLoading(false);
        setStatus({});
        setExpandedMode(false);
      }),
      api?.onQuickChatSaved?.((data) => showNotice(data?.sessionId ? '已保留到主会话列表' : '已保留')),
    ].filter(Boolean) as Array<() => void>;

    return () => {
      unsubs.forEach(fn => fn());
      if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
      if (noticeTimerRef.current) window.clearTimeout(noticeTimerRef.current);
    };
  }, [setExpandedMode, show, showNotice]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      if (expanded) return;
      event.preventDefault();
      switchMode(mode === 'chat' ? 'find' : 'chat');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [expanded, mode, switchMode]);

  useEffect(() => {
    noteActivity();
  }, [input, noteActivity]);

  useEffect(() => {
    if (mode !== 'find') return;
    const text = input.trim();
    if (!text) {
      setFindResults([]);
      setFindLoading(false);
      setSelectedFindIndex(0);
      return;
    }
    let cancelled = false;
    setFindLoading(true);
    const timer = window.setTimeout(() => {
      window.electronAPI?.quickFindLocalSearch?.(text)
        .then(results => {
          if (cancelled) return;
          setFindResults(Array.isArray(results) ? results : []);
          setSelectedFindIndex(0);
        })
        .catch(() => {
          if (!cancelled) setFindResults([]);
        })
        .finally(() => {
          if (!cancelled) setFindLoading(false);
        });
    }, 140);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [input, mode]);

  useEffect(() => {
    if (mode !== 'find') return;
    if ((findLoading || findResults.length > 0) && !expanded) {
      setExpandedMode(true);
    }
  }, [expanded, findLoading, findResults.length, mode, setExpandedMode]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [entries, streamingText]);

  const openFindResult = useCallback(async (result: QuickFindResult, reveal = false) => {
    const response = await window.electronAPI?.quickFindOpen?.(result.path, reveal);
    if (response && response.ok === false) {
      showNotice(response.error || '打开失败');
      return;
    }
    showNotice(reveal ? '已在文件夹中显示' : '已打开');
    hide();
  }, [hide, showNotice]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text) return;
    if (mode === 'find') {
      const selected = findResults[selectedFindIndex];
      if (selected) {
        await openFindResult(selected);
        return;
      }
      setFindLoading(true);
      const results = await window.electronAPI?.quickFindAgentSearch?.(text).catch(() => []);
      setFindResults(Array.isArray(results) ? results : []);
      setSelectedFindIndex(0);
      setFindLoading(false);
      if (!results || results.length === 0) showNotice('没有找到匹配的文件或目录');
      return;
    }
    if (loading) {
      showNotice('当前回复还在进行中，请稍后再发送。');
      return;
    }
    setInput('');
    setExpandedMode(true);
    const result = await window.electronAPI?.quickChatSend?.(text);
    if (result && result.ok === false) {
      showNotice(result.error === 'BUSY' ? '当前回复还在进行中。' : '发送失败');
    }
  }, [findResults, input, loading, mode, openFindResult, selectedFindIndex, setExpandedMode, showNotice]);

  const clear = useCallback(() => {
    window.electronAPI?.quickChatClear?.();
  }, []);

  const close = useCallback(() => {
    window.electronAPI?.quickChatAbort?.();
    window.electronAPI?.quickChatClear?.();
    hide();
  }, [hide]);

  const save = useCallback(async () => {
    const result = await window.electronAPI?.quickChatSaveSession?.();
    if (result && result.ok === false) showNotice('当前没有可保留的对话。');
  }, [showNotice]);

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    noteActivity();
    if (event.key === 'Escape') {
      event.preventDefault();
      hide();
      return;
    }
    if (!expanded && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
      event.preventDefault();
      switchMode(mode === 'chat' ? 'find' : 'chat');
      return;
    }
    if (mode === 'find' && findResults.length > 0 && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      event.preventDefault();
      setSelectedFindIndex(prev => {
        const next = event.key === 'ArrowDown' ? prev + 1 : prev - 1;
        return (next + findResults.length) % findResults.length;
      });
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      void send();
    }
  };

  const statusText = phaseText(status, loading);
  const chatExpanded = expanded && mode === 'chat';

  return (
    <div
      className={`quick-launcher-shell ${expanded ? 'expanded' : 'compact'} ${visible ? 'visible' : 'hidden'}`}
      onMouseDown={noteActivity}
      onMouseMove={noteActivity}
    >
      {chatExpanded && (
        <div className="quick-chat-header">
          <div className="quick-chat-title">Quick Chat</div>
          <div className="quick-chat-actions">
            <button type="button" onClick={save}>保留对话</button>
            <button type="button" onClick={clear}>清空</button>
            <button type="button" onClick={close}>×</button>
          </div>
        </div>
      )}

      {chatExpanded && (
        <div className="quick-chat-messages" ref={scrollRef}>
          {entries.map(entry => (
            <div key={entry.id} className={`quick-msg ${entry.role}`}>
              {entry.role === 'tool' ? (
                <>
                  <div className="quick-tool-name">Tool · {entry.toolName}</div>
                  {entry.toolArgs && <pre>{entry.toolArgs}</pre>}
                  {entry.toolResult && <pre>{entry.toolResult}</pre>}
                </>
              ) : entry.content}
            </div>
          ))}
          {streamingText && <div className="quick-msg assistant streaming">{streamingText}</div>}
        </div>
      )}

      <div className="quick-input-row">
        <div className="quick-launcher-drag" />
        <div className="quick-mode-toggle" data-mode={mode} role="tablist" aria-label="QuickLauncher mode">
          <span className="quick-mode-indicator" />
          <button className={mode === 'chat' ? 'active' : ''} onClick={() => switchMode('chat')} type="button">
            <span className="quick-dot" />
            Chat
          </button>
          <button className={mode === 'find' ? 'active' : ''} onClick={() => switchMode('find')} type="button">
            <span className="quick-dot" />
            Find
          </button>
        </div>
        <input
          ref={inputRef}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onFocus={noteActivity}
          onKeyDown={onKeyDown}
          placeholder={mode === 'chat' ? '向 DeepSeek Code 提问...' : '搜索并打开文件或目录...'}
          spellCheck={false}
        />
        <button className="quick-send-btn" type="button" onClick={send} disabled={loading && mode === 'chat'}>
          {mode === 'chat' ? '发送' : findLoading ? '检索中' : '打开'}
        </button>
        {!expanded && <div className="quick-phase-badge">Phase 7</div>}
      </div>

      {mode === 'find' && (findResults.length > 0 || findLoading) && (
        <div className="quick-find-results">
          {findLoading && <div className="quick-find-loading">正在检索最近文件和工作区...</div>}
          {findResults.map((result, index) => (
            <button
              key={result.path}
              type="button"
              className={`quick-find-item ${index === selectedFindIndex ? 'selected' : ''}`}
              onMouseEnter={() => setSelectedFindIndex(index)}
              onClick={(event) => { void openFindResult(result, event.ctrlKey); }}
            >
              <span className="quick-find-type">{findResultType(result)}</span>
              <span className="quick-find-main">
                <strong>{result.name}</strong>
                <small>{result.path}</small>
              </span>
              <span className="quick-find-reason">{findResultReason(result)}</span>
            </button>
          ))}
        </div>
      )}

      {chatExpanded && statusText && <div className="quick-status">{statusText}</div>}
      {notice && <div className="quick-notice">{notice}</div>}
    </div>
  );
}

createRoot(document.getElementById('quick-launcher-root')!).render(
  <React.StrictMode>
    <QuickLauncherApp />
  </React.StrictMode>,
);
