import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../styles/global.css';
import '../styles/dark.css';
import './quick-launcher.css';
import { useSpeechInput } from '../hooks/useSpeechInput';

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
  favorite?: boolean;
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
      onQuickChatSaveError?: (cb: (data: { message?: string }) => void) => () => void;
      quickFindLocalSearch?: (query: string) => Promise<QuickFindResult[]>;
      quickFindAgentSearch?: (query: string) => Promise<QuickFindResult[]>;
      quickFindOpen?: (path: string, reveal?: boolean) => Promise<{ ok?: boolean; error?: string }>;
      getConfig?: () => Promise<{ quickLauncher?: { favorites?: string[] } }>;
      setConfig?: (key: string, value: unknown) => Promise<void>;
      clipboardWrite?: (text: string) => Promise<void>;
      clipboardRead?: () => Promise<string>;
      quickFindReadFile?: (path: string) => Promise<{ ok?: boolean; content?: string; size?: number; error?: string }>;
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
  if (result.source === 'recent') return '最近打开';
  if (result.source === 'workspace') return '工作区';
  if (result.source === 'desktop') return '桌面';
  if (result.source === 'downloads') return '下载';
  if (result.source === 'documents') return '文档';
  if (result.source === 'favorite') return '已收藏';
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
  const [selectedFindIndex, setSelectedFindIndex] = useState(-1);
  const [agentSearched, setAgentSearched] = useState(false);
  const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set());
  const [savingSession, setSavingSession] = useState(false);
  const [savedSessionId, setSavedSessionId] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const findScrollRef = useRef<HTMLDivElement | null>(null);
  const hideTimerRef = useRef<number | null>(null);
  const noticeTimerRef = useRef<number | null>(null);
  const visibleRef = useRef(false);

  // ─── 状态 refs（供 window-level keydown 闭包用）───
  const expandedRef = useRef(expanded);
  const modeRef = useRef(mode);
  const entriesRef = useRef(entries);
  const streamingTextRef = useRef(streamingText);
  const findResultsRef = useRef(findResults);
  const selectedFindIndexRef = useRef(selectedFindIndex);
  const favoritesRef = useRef(favorites);
  useEffect(() => { expandedRef.current = expanded; }, [expanded]);
  useEffect(() => { modeRef.current = mode; }, [mode]);
  useEffect(() => { entriesRef.current = entries; }, [entries]);
  useEffect(() => { streamingTextRef.current = streamingText; }, [streamingText]);
  useEffect(() => { findResultsRef.current = findResults; }, [findResults]);
  useEffect(() => { selectedFindIndexRef.current = selectedFindIndex; }, [selectedFindIndex]);
  useEffect(() => { favoritesRef.current = favorites; }, [favorites]);

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
    if (loading || findLoading) return;
    if (expanded && (entries.length > 0 || findResults.length > 0 || streamingText)) return;
    const delay = expanded ? panelAutoHideMs : inputAutoHideMs;
    hideTimerRef.current = window.setTimeout(() => {
      hide();
    }, delay);
  }, [expanded, entries.length, findLoading, findResults.length, hide, inputAutoHideMs, loading, panelAutoHideMs, streamingText]);

  const show = useCallback(() => {
    visibleRef.current = true;
    setVisible(true);
    resetAutoHide();
    const focusInput = () => {
      window.focus();
      inputRef.current?.focus({ preventScroll: true });
    };
    focusInput();
    requestAnimationFrame(focusInput);
    [16, 32, 64, 120, 220, 360].forEach(ms => window.setTimeout(focusInput, ms));
  }, [resetAutoHide]);

  useLayoutEffect(() => {
    if (visible) {
      const focus = () => {
        window.focus();
        inputRef.current?.focus({ preventScroll: true });
      };
      focus();
      const ids = [10, 30, 60, 100, 160, 240, 360, 520].map(ms => setTimeout(focus, ms));
      return () => ids.forEach(clearTimeout);
    }
  }, [visible]);

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
    setSelectedFindIndex(-1);
    setAgentSearched(false);
    noteActivity();
  }, [noteActivity]);

  // ─── 持久化收藏 ───
  const persistFavorites = useCallback((next: string[]) => {
    setFavorites(next);
    window.electronAPI?.setConfig?.('quickLauncher', { favorites: next }).catch(() => {});
  }, []);

  const toggleFavorite = useCallback((targetPath: string) => {
    const prev = favoritesRef.current;
    const next = prev.includes(targetPath)
      ? prev.filter(p => p !== targetPath)
      : [targetPath, ...prev];
    persistFavorites(next);
    showNotice(prev.includes(targetPath) ? '已取消收藏' : '已收藏');
    noteActivity();
  }, [persistFavorites, showNotice, noteActivity]);

  const copyPath = useCallback(async (path: string) => {
    try {
      if (window.electronAPI?.clipboardWrite) {
        await window.electronAPI.clipboardWrite(path);
      } else {
        await navigator.clipboard.writeText(path);
      }
      showNotice('已复制路径');
    } catch {
      showNotice('复制失败');
    }
  }, [showNotice]);

  // ─── 初始化 ───
  useEffect(() => {
    window.electronAPI?.quickLauncherGetState?.()
      .then(state => {
        if (state?.mode === 'chat' || state?.mode === 'find') setMode(state.mode);
        if (typeof state?.inputAutoHideMs === 'number') setInputAutoHideMs(state.inputAutoHideMs);
        if (typeof state?.panelAutoHideMs === 'number') setPanelAutoHideMs(state.panelAutoHideMs);
      })
      .catch(() => {});
    window.electronAPI?.getConfig?.()
      .then(cfg => {
        if (cfg?.quickLauncher?.favorites) setFavorites(cfg.quickLauncher.favorites);
      })
      .catch(() => {});
  }, []);

  // ─── IPC 事件订阅 ───
  useEffect(() => {
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
        setSavingSession(false);
        setSavedSessionId(null);
        setExpandedMode(false);
      }),
      api?.onQuickChatSaved?.((data) => {
        setSavingSession(false);
        setSavedSessionId(data?.sessionId || null);
        showNotice(data?.sessionId ? '已保留到主会话列表' : '已保留');
      }),
      api?.onQuickChatSaveError?.((data) => {
        setSavingSession(false);
        showNotice(data?.message || '保留对话失败');
      }),
    ].filter(Boolean) as Array<() => void>;

    return () => {
      unsubs.forEach(fn => fn());
      if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
      if (noticeTimerRef.current) window.clearTimeout(noticeTimerRef.current);
    };
  }, [setExpandedMode, show, showNotice]);

  // ─── 自动隐藏 ───
  useEffect(() => { noteActivity(); }, [input, noteActivity]);

  // ─── 主题同步 ───
  useEffect(() => {
    const apply = (t: string, ls?: string) => {
      document.documentElement.setAttribute('data-theme', t);
      if (ls) document.documentElement.setAttribute('data-light-scheme', ls);
    };
    window.electronAPI?.getConfig?.().then((c: any) => {
      if (c) apply(c.theme || 'light', c.lightScheme);
    }).catch(() => {});
    const handler = (e: MessageEvent) => {
      if (e.data?.type === 'theme-changed') {
        apply(e.data.theme, e.data.lightScheme);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  // ─── AI 输出结束后重启自动隐藏 ───
  const prevLoadingRef = useRef(loading);
  useEffect(() => {
    if (prevLoadingRef.current && !loading) resetAutoHide();
    prevLoadingRef.current = loading;
  }, [loading, resetAutoHide]);

  // ─── 收藏变更时刷新搜索结果 ───
  useEffect(() => {
    if (mode !== 'find') return;
    const text = input.trim();
    if (!text) return;
    window.electronAPI?.quickFindLocalSearch?.(text, favoritesRef.current).then(results => {
      const merged = (results || []).map(r => ({
        ...r,
        favorite: favorites.includes(r.path),
      }));
      setFindResults(merged);
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [favorites]);

  // ─── 搜索 debounce 200ms ───
  useEffect(() => {
    if (mode !== 'find') return;
    const text = input.trim();
    if (!text) {
      setFindResults([]);
      setFindLoading(false);
      setSelectedFindIndex(-1);
      setAgentSearched(false);
      return;
    }
    let cancelled = false;
    setFindLoading(true);
    setAgentSearched(false);
    const timer = window.setTimeout(() => {
      window.electronAPI?.quickFindLocalSearch?.(text, favoritesRef.current)
        .then(results => {
          if (cancelled) return;
          const merged = (results || []).map(r => ({
            ...r,
            favorite: favoritesRef.current.includes(r.path),
          }));
          setFindResults(merged);
          setSelectedFindIndex(-1);
        })
        .catch(() => { if (!cancelled) setFindResults([]); })
        .finally(() => { if (!cancelled) setFindLoading(false); });
    }, 200);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [input, mode]);

  // ─── find 结果出现/消失自动展开/收起 ───
  useEffect(() => {
    if (mode !== 'find') return;
    if (findResults.length > 0 && !expanded) setExpandedMode(true);
    if (findResults.length === 0 && !findLoading && expanded) setExpandedMode(false);
  }, [expanded, findLoading, findResults.length, mode, setExpandedMode]);

  // ─── 聊天自动滚底 ───
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [entries, streamingText]);

  // ═══════════════════════════════════════════════
  // 核心操作函数
  // ═══════════════════════════════════════════════

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
      if (selectedFindIndex >= 0 && findResults[selectedFindIndex]) {
        await openFindResult(findResults[selectedFindIndex]);
        return;
      }
      if (findLoading) return;
      setFindLoading(true);
      setAgentSearched(true);
      const results = await window.electronAPI?.quickFindAgentSearch?.(text).catch(() => []);
      const list = Array.isArray(results) ? results : [];
      setFindResults(list);
      setSelectedFindIndex(list.length > 0 ? 0 : -1);
      setFindLoading(false);
      if (list.length === 0) showNotice('没有找到匹配的文件或目录');
      return;
    }
    if (loading) { showNotice('当前回复还在进行中，请稍后再发送。'); return; }
    setInput('');
    setExpandedMode(true);
    const result = await window.electronAPI?.quickChatSend?.(text);
    if (result && result.ok === false) {
      showNotice(result.error === 'BUSY' ? '当前回复还在进行中。' : '发送失败');
    }
  }, [findResults, findLoading, input, loading, mode, openFindResult, selectedFindIndex, setExpandedMode, showNotice]);

  const clear = useCallback(() => {
    window.electronAPI?.quickChatClear?.();
  }, []);

  const save = useCallback(async () => {
    if (savingSession) return;
    if (entriesRef.current.length === 0 && !streamingTextRef.current) {
      showNotice('当前没有可保留的对话。');
      return;
    }
    setSavingSession(true);
    try {
      const result = await window.electronAPI?.quickChatSaveSession?.();
      if (!result || result.ok === false) {
        setSavingSession(false);
        showNotice(result?.error === 'EMPTY_CHAT' ? '当前没有可保留的对话。' : `保留失败：${result?.error || '未知错误'}`);
        return;
      }
      setSavedSessionId(result.sessionId || null);
      showNotice('已保留到主会话列表');
    } catch (error) {
      setSavingSession(false);
      showNotice(error instanceof Error ? `保留失败：${error.message}` : '保留对话失败');
    }
  }, [savingSession, showNotice]);

  // ═══════════════════════════════════════════════
  // 键盘快捷键（集中管理，window-level 保证可靠性）
  // ═══════════════════════════════════════════════

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // 仅在窗口可见时处理
      if (!visibleRef.current) return;

      // Escape → 隐藏
      if (event.key === 'Escape') {
        event.preventDefault();
        hide();
        return;
      }

      // ── Ctrl 键：保留对话（chat + 展开 + 有对话内容）──
      if (event.key === 'Control' && !event.altKey && !event.shiftKey && !event.metaKey) {
        const exp = expandedRef.current;
        const m = modeRef.current;
        const hasConv = entriesRef.current.length > 0 || streamingTextRef.current;
        if (exp && m === 'chat' && hasConv) {
          event.preventDefault();
          save();
        }
        return;
      }

      // ── Alt 键 ──
      if (event.key === 'Alt' && !event.ctrlKey && !event.shiftKey && !event.metaKey) {
        const exp = expandedRef.current;
        const m = modeRef.current;
        const hasConv = entriesRef.current.length > 0 || streamingTextRef.current;
        if (!exp) {
          // 未展开时：切换 Chat/Find 模式
          event.preventDefault();
          switchMode(m === 'chat' ? 'find' : 'chat');
        } else if (m === 'chat' && hasConv) {
          // 展开 + chat + 有对话 → 清空
          event.preventDefault();
          clear();
        }
        return;
      }

      // ── Find 模式快捷键 ──
      if (modeRef.current === 'find' && findResultsRef.current.length > 0) {
        const idx = selectedFindIndexRef.current;
        const results = findResultsRef.current;
        const selected = idx >= 0 && results[idx] ? results[idx] : null;

        // X → 收藏/取消收藏
        if (event.key === 'x' && !event.ctrlKey && !event.altKey && !event.metaKey && selected) {
          event.preventDefault();
          toggleFavorite(selected.path);
          return;
        }

        // Ctrl+C → 复制路径
        if (event.key === 'c' && event.ctrlKey && !event.altKey && !event.shiftKey && !event.metaKey && selected) {
          event.preventDefault();
          copyPath(selected.path);
          return;
        }
      }

      // Enter → 发送 / 打开
      if (event.key === 'Enter') {
        event.preventDefault();
        void send();
        return;
      }
    };

    // 阻止 Alt 键触发菜单栏
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === 'Alt') event.preventDefault();
    };

    window.addEventListener('keydown', onKeyDown, { capture: true });
    window.addEventListener('keyup', onKeyUp, { capture: true });
    return () => {
      window.removeEventListener('keydown', onKeyDown, { capture: true });
      window.removeEventListener('keyup', onKeyUp, { capture: true });
    };
  }, [hide, switchMode, save, clear, toggleFavorite, copyPath, send, showNotice, setInput, setExpandedMode]);

  // 输入框内少量辅助快捷键（仅上下键选择，因为需要 preventDefault 在 React 合成事件层面）
  const onInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    noteActivity();
    // 上下键选择 find 结果
    if (mode === 'find' && findResults.length > 0 && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      event.preventDefault();
      setSelectedFindIndex(prev => {
        let next: number;
        if (event.key === 'ArrowDown') {
          if (prev < 0) next = 0;
          else if (prev >= findResults.length - 1) next = -1;
          else next = prev + 1;
        } else {
          if (prev < 0) next = findResults.length - 1;
          else if (prev === 0) next = -1;
          else next = prev - 1;
        }
        if (next >= 0) {
          setTimeout(() => {
            const el = findScrollRef.current?.children[next] as HTMLElement | undefined;
            el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
          }, 20);
        }
        return next;
      });
    }
  };

  // ═══════════════════════════════════════════════
  // 渲染
  // ═══════════════════════════════════════════════

  const statusText = phaseText(status, loading);
  const chatExpanded = expanded && mode === 'chat';
  const hasConversation = entries.length > 0 || streamingText;

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
            <button type="button" onClick={save} disabled={savingSession}>
              {savingSession ? '保留中...' : savedSessionId ? '已保留' : `保留对话 (Ctrl)`}
            </button>
            <button type="button" onClick={clear}>{`清空 (Alt)`}</button>
            <button type="button" onClick={() => {
              window.electronAPI?.quickChatAbort?.();
              window.electronAPI?.quickChatClear?.();
              hide();
            }}>×</button>
          </div>
        </div>
      )}

      {chatExpanded && (
        <div className="quick-chat-messages" ref={scrollRef}>
          {entries.map(entry => (
            entry.role === 'tool' ? (
              <div key={entry.id} className="quick-msg tool">
                <div
                  className="quick-tool-header"
                  onClick={() => setExpandedTools(prev => {
                    const next = new Set(prev);
                    next.has(entry.id) ? next.delete(entry.id) : next.add(entry.id);
                    return next;
                  })}
                >
                  <span className="quick-tool-toggle">{expandedTools.has(entry.id) ? '▾' : '▸'}</span>
                  <span className="quick-tool-name">🔧 {entry.toolName}</span>
                  {entry.toolArgs && !expandedTools.has(entry.id) && (
                    <span className="quick-tool-args">{entry.toolArgs.slice(0, 80)}</span>
                  )}
                </div>
                {expandedTools.has(entry.id) && (
                  <div className="quick-tool-body">
                    {entry.toolArgs && <pre className="quick-tool-section">输入：{entry.toolArgs}</pre>}
                    {entry.toolResult && <pre className="quick-tool-section">输出：{entry.toolResult}</pre>}
                  </div>
                )}
              </div>
            ) : (
              <div key={entry.id} className={`quick-msg ${entry.role}`}>
                {entry.content}
              </div>
            )
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
          onKeyDown={onInputKeyDown}
          placeholder={mode === 'chat' ? '提问... Ctrl+Enter 分析文件  📋 分析剪贴板' : '搜索文件... ↑↓选择 Enter打开 Ctrl+Enter 智能分析'}
          spellCheck={false}
        />
        {speech.listening ? (
          <span className="quick-speech-ind" title="录音中... 松开 Q">🎤</span>
        ) : (
          <button className="quick-send-btn quick-speech-btn" type="button" title="按住 Q 语音输入" onClick={() => {}} style={{ padding: '0 6px', fontSize: 14 }}>🎤</button>
        )}
        <button className="quick-send-btn quick-clip-btn" type="button" onClick={async () => {
    const clip = await window.electronAPI?.clipboardRead?.();
    if (!clip || !clip.trim()) { showNotice('剪贴板为空'); return; }
    setInput('');
    setExpandedMode(true);
    window.electronAPI?.quickChatSend?.(`分析这段内容:\n\n${clip.slice(0, 8000)}`);
  }} title="分析剪贴板内容">📋</button>
  <button className="quick-send-btn" type="button" onClick={send} disabled={(loading && mode === 'chat') || (mode === 'find' && findLoading)}>
          {mode === 'chat' ? '发送' : findLoading ? '检索中' : selectedFindIndex >= 0 ? '打开' : '检索'}
        </button>
        <span className={`quick-launcher-spark ${(loading || findLoading) ? 'active' : ''}`} />
        {!expanded && <div className="quick-phase-badge" />}
      </div>

      {mode === 'find' && (findResults.length > 0 || findLoading) && (
        <div className="quick-find-results" ref={findScrollRef}>
          {findLoading && <div className="quick-find-loading">{agentSearched ? '正在让 Agent 检索...' : '正在检索最近文件和工作区...'}</div>}
          {!findLoading && agentSearched && findResults.length === 0 && (
            <div className="quick-find-loading">Agent 未找到匹配，请输入更具体的信息</div>
          )}
          {!findLoading && agentSearched && findResults.length > 0 && (
            <div className="quick-find-loading" style={{ color: 'rgba(192,230,253,0.7)' }}>Agent 检索结果（↑↓选择 Enter打开 Ctrl+Enter分析 X收藏 Ctrl+C复制）</div>
          )}
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
                <small>{result.path.replace(/\\/g, '/').replace(/^[A-Z]:/, '')}</small>
              </span>
              <span className="quick-find-actions" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <button
                  type="button"
                  className={`quick-fav-btn ${favorites.includes(result.path) ? 'active' : ''}`}
                  onClick={(e) => { e.stopPropagation(); toggleFavorite(result.path); }}
                  title={favorites.includes(result.path) ? '取消收藏 (X)' : '收藏 (X)'}
                >
                  {favorites.includes(result.path) ? '★' : '☆'}
                </button>
                <span className="quick-find-reason">{findResultReason(result)}</span>
              </span>
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
