import React, { useEffect, useState } from 'react';
import { useChatStore } from '../stores/chat-store';

interface SessionItem {
  id: string;
  title: string;
  modelId: string;
  updatedAt: number;
}

export function SessionList() {
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [loading, setLoading] = useState(false);
  const { clear, entries } = useChatStore();

  const loadSessions = async () => {
    setLoading(true);
    try {
      const list = await window.electronAPI.listSessions();
      setSessions(list as SessionItem[]);
    } catch {
      // ignore
    }
    setLoading(false);
  };

  useEffect(() => {
    loadSessions();
  }, []);

  const handleNew = () => {
    clear();
    (window as any).__currentSessionId = null;
  };

  const handleLoad = async (id: string) => {
    try {
      const session = await window.electronAPI.loadSession(id);
      if (!session) return;

      const s = session as { messages: Array<{ role: string; content: string; toolName?: string; toolResult?: string; timestamp: number }> };
      clear();
      for (const msg of s.messages) {
        useChatStore.getState().addEntry({
          id: Date.now().toString() + Math.random(),
          role: msg.role as 'user' | 'assistant' | 'tool',
          content: msg.content,
          toolName: msg.toolName,
          toolResult: msg.toolResult,
          timestamp: msg.timestamp,
        });
      }
    } catch (err) {
      console.error('Failed to load session:', err);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await window.electronAPI.deleteSession(id);
      loadSessions();
    } catch {
      // ignore
    }
  };

  const handleSave = async () => {
    if (entries.length === 0) return;
    const id = Date.now().toString();
    const title = entries.find(e => e.role === 'user')?.content.slice(0, 50) || 'Untitled';
    try {
      await window.electronAPI.saveSession({
        id,
        title,
        projectPath: '',
        modelId: '',
        messages: entries,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      loadSessions();
    } catch (err) {
      console.error('Failed to save:', err);
    }
  };

  return (
    <div className="session-list">
      <div className="session-list-header">
        <span className="session-list-title">Sessions</span>
        <div className="session-list-actions">
          <button className="session-btn" onClick={handleNew} title="New session">+</button>
          <button className="session-btn" onClick={handleSave} title="Save current" disabled={entries.length === 0}>&#x1F4BE;</button>
        </div>
      </div>
      <div className="session-list-items">
        {loading && <div className="session-list-loading">Loading...</div>}
        {sessions.length === 0 && !loading && (
          <div className="session-list-empty">No saved sessions</div>
        )}
        {sessions.map(s => (
          <div key={s.id} className="session-item" onClick={() => handleLoad(s.id)}>
            <div className="session-item-title">{s.title}</div>
            <div className="session-item-meta">
              <span className="session-item-model">{s.modelId || 'unknown'}</span>
              <span className="session-item-time">
                {new Date(s.updatedAt).toLocaleDateString()}
              </span>
            </div>
            <button
              className="session-item-delete"
              onClick={e => { e.stopPropagation(); handleDelete(s.id); }}
              title="Delete"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
