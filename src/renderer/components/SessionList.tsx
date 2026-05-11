import React, { useEffect, useState, useCallback, useRef } from 'react';
import { getSessionStatus, setSessionId, useChatStore, type ChatEntry, type SessionStatus } from '../stores/chat-store';
import { useAppStore } from '../stores/app-store';

interface SessionItem {
  id: string;
  title?: string;
  modelId?: string;
  updatedAt?: number;
}

const statusLabels: Record<SessionStatus, string> = {
  idle: '无任务',
  running: '进行中',
  error: '错误',
};

export function SessionList() {
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [loading, setLoading] = useState(false);
  const { loadEntries, removeSession, startNew, switchTo } = useChatStore();
  const activeId = useChatStore(s => s.activeId);
  const localSessions = useChatStore(s => s.sessions);

  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; id: string } | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const renameRef = useRef<HTMLInputElement>(null);

  const loadSessions = useCallback(async () => {
    setLoading(true);
    try {
      const list = await window.electronAPI.listSessions();
      setSessions(list as SessionItem[]);
    } catch {
      // ignore
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadSessions();
    const handler = () => loadSessions();
    window.addEventListener('session-saved', handler);
    return () => window.removeEventListener('session-saved', handler);
  }, [loadSessions]);

  useEffect(() => {
    if (!ctxMenu) return;
    const close = () => setCtxMenu(null);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [ctxMenu]);

  useEffect(() => {
    if (renaming) renameRef.current?.focus();
  }, [renaming]);

  const handleNew = () => {
    startNew();
  };

  const handleLoad = async (id: string) => {
    if (renaming) return;
    if (localSessions[id]) {
      setSessionId(id);
      switchTo(id);
      // 恢复此 session 的模型
      const savedModel = sessions.find(x => x.id === id)?.modelId;
      if (savedModel) {
        useAppStore.getState().setModel(savedModel);
        window.electronAPI?.setSessionModel?.(id, savedModel);
      }
      return;
    }

    try {
      const session = await window.electronAPI.loadSession(id);
      if (!session) return;

      const s = session as { id: string; modelId?: string; messages?: Array<ChatEntry>; agentMessages?: unknown[] };
      setSessionId(s.id);
      const chatEntries = (s.messages || []).map((msg: ChatEntry) => ({
        id: Date.now().toString() + Math.random(),
        role: msg.role,
        content: msg.content,
        attachments: msg.attachments,
        toolName: msg.toolName,
        toolArgs: msg.toolArgs,
        toolResult: msg.toolResult,
        timestamp: msg.timestamp || Date.now(),
      }));
      loadEntries(s.id, chatEntries);

      const agentMessages = Array.isArray(s.agentMessages) && s.agentMessages.length > 0
        ? s.agentMessages
        : (s.messages || [])
          .filter(msg => msg.role === 'user' || msg.role === 'assistant')
          .map(msg => ({ role: msg.role, content: msg.content, attachments: msg.attachments }));
      window.electronAPI?.setAgentContext?.(s.id, agentMessages, s.modelId || '');
    } catch (err) {
      console.error('Failed to load session:', err);
    }
  };

  const handleDelete = async (id: string) => {
    setCtxMenu(null);
    removeSession(id);
    try {
      await window.electronAPI.abort(id);
      await window.electronAPI.resetAgent(id);
      await window.electronAPI.deleteSession(id);
      loadSessions();
    } catch {
      loadSessions();
    }
  };

  const handleContextMenu = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    setCtxMenu({ x: e.clientX, y: e.clientY, id });
  };

  const startRename = () => {
    if (!ctxMenu) return;
    const s = sessions.find(x => x.id === ctxMenu.id);
    setRenaming(ctxMenu.id);
    setRenameValue(s?.title || '');
    setCtxMenu(null);
  };

  const commitRename = async () => {
    const newTitle = renameValue.trim();
    if (newTitle && renaming) {
      await window.electronAPI?.renameSession(renaming, newTitle);
      loadSessions();
    }
    setRenaming(null);
    setRenameValue('');
  };

  const handleRenameKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') commitRename();
    if (e.key === 'Escape') {
      setRenaming(null);
      setRenameValue('');
    }
  };

  const displayedSessions: Array<SessionItem & { status: SessionStatus }> = sessions.map(s => ({
    ...s,
    status: getSessionStatus(localSessions[s.id]),
  }));
  const persistedIds = new Set(sessions.map(s => s.id));
  for (const [id, local] of Object.entries(localSessions)) {
    if (id === 'default' || persistedIds.has(id)) continue;
    if (local.entries.length === 0 && !local.isStreaming && !local.error) continue;
    const firstUser = local.entries.find(entry => entry.role === 'user')?.content;
    const lastTimestamp = local.entries[local.entries.length - 1]?.timestamp;
    displayedSessions.push({
      id,
      title: firstUser ? firstUser.slice(0, 50) : 'Untitled',
      modelId: 'unknown',
      updatedAt: lastTimestamp || Date.now(),
      status: getSessionStatus(local),
    });
  }
  displayedSessions.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

  return (
    <div className="session-list">
      <div className="session-list-header">
        <span className="session-list-title">Sessions</span>
        <div className="session-list-actions">
          <button className="session-btn" onClick={handleNew} title="新建会话">+</button>
        </div>
      </div>
      <div className="session-list-items">
        {loading && <div className="session-list-loading">Loading...</div>}
        {displayedSessions.length === 0 && !loading && (
          <div className="session-list-empty">Send a message to auto-save</div>
        )}
        {displayedSessions.map(s => (
          <div
            key={s.id}
            className={`session-item ${activeId === s.id ? 'active' : ''}`}
            onClick={() => handleLoad(s.id)}
            onContextMenu={e => handleContextMenu(e, s.id)}
          >
            {renaming === s.id ? (
              <input
                ref={renameRef}
                className="session-rename-input"
                value={renameValue}
                onChange={e => setRenameValue(e.target.value)}
                onBlur={commitRename}
                onKeyDown={handleRenameKey}
                onClick={e => e.stopPropagation()}
              />
            ) : (
              <div className="session-item-title">{s.title || 'Untitled'}</div>
            )}
            <div className="session-item-meta">
              <span className="session-item-model">{s.modelId || 'unknown'}</span>
              <span className="session-item-time">
                {s.updatedAt ? new Date(s.updatedAt).toLocaleDateString() : ''}
              </span>
              <span className={`session-status session-status-${s.status}`}>
                <span className="session-status-dot" />
                {statusLabels[s.status]}
              </span>
            </div>
            <button
              className="session-item-delete"
              onClick={e => { e.stopPropagation(); handleDelete(s.id); }}
              title="Delete"
            >
              x
            </button>
          </div>
        ))}
      </div>

      {ctxMenu && (
        <div className="ctx-menu" style={{ left: ctxMenu.x, top: ctxMenu.y }}>
          <button className="ctx-menu-item" onClick={startRename}>
            重命名
          </button>
          <button className="ctx-menu-item ctx-menu-danger" onClick={() => handleDelete(ctxMenu.id)}>
            删除
          </button>
        </div>
      )}
    </div>
  );
}
