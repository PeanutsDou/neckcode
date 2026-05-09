import { create } from 'zustand';

export interface ChatEntry {
  id: string;
  role: 'user' | 'assistant' | 'tool' | 'system';
  content: string;
  attachments?: { type: string; data: string; name: string; size: number }[];
  toolName?: string;
  toolArgs?: string;
  toolResult?: string;
  timestamp: number;
}

export interface SessionState {
  entries: ChatEntry[];
  isStreaming: boolean;
  streamingText: string;
  error: string | null;
  pendingContext: string | null;
  runStartedAt: number | null;
}

export type SessionStatus = 'idle' | 'running' | 'error';

interface ChatState {
  activeId: string | null;
  sessions: Record<string, SessionState>;
  focusVersion: number;

  addEntry: (entry: ChatEntry) => void;
  appendDelta: (text: string) => void;
  finishStream: (text: string) => void;
  setStreaming: (v: boolean) => void;
  setError: (msg: string | null) => void;
  setPendingContext: (text: string | null) => void;
  triggerFocus: () => void;

  addEntryTo: (sid: string, entry: ChatEntry) => void;
  appendDeltaTo: (sid: string, text: string) => void;
  finishStreamTo: (sid: string, text: string) => void;
  setStreamingTo: (sid: string, v: boolean) => void;
  setErrorTo: (sid: string, msg: string | null) => void;

  ensureActiveSession: () => string;
  startNew: () => void;
  switchTo: (id: string) => void;
  loadEntries: (id: string, entries: ChatEntry[]) => void;
  removeSession: (id: string) => void;
  clearActive: () => void;
}

function emptySession(): SessionState {
  return { entries: [], isStreaming: false, streamingText: '', error: null, pendingContext: null, runStartedAt: null };
}

function updateSession(
  state: ChatState,
  id: string,
  updater: (ses: SessionState) => SessionState,
): ChatState {
  const ses = state.sessions[id] || emptySession();
  return {
    ...state,
    sessions: { ...state.sessions, [id]: updater(ses) },
  };
}

let currentSessionId: string | null = null;
const titlesGenerated = new Set<string>();

function createSessionId(): string {
  return `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function getSessionStatus(session?: SessionState): SessionStatus {
  if (!session) return 'idle';
  if (session.error) return 'error';
  if (session.isStreaming) return 'running';
  return 'idle';
}

async function autoSave(sessionId: string, entries: ChatEntry[]) {
  if (entries.length === 0) return;

  const firstUserMsg = entries.find(e => e.role === 'user')?.content || '';
  const isNew = !titlesGenerated.has(sessionId);
  const title = isNew ? (firstUserMsg.slice(0, 50) || 'Untitled') : undefined;

  const sessionData: Record<string, unknown> = {
    id: sessionId,
    projectPath: '',
    modelId: '',
    messages: entries,
    updatedAt: Date.now(),
  };
  if (title) (sessionData as any).title = title;
  if (isNew) (sessionData as any).createdAt = Date.now();

  try {
    await window.electronAPI?.saveSession(sessionData);
    window.dispatchEvent(new CustomEvent('session-saved'));
    if (isNew) titlesGenerated.add(sessionId);
    if (isNew && firstUserMsg && window.electronAPI?.generateTitle) {
      window.electronAPI.generateTitle(firstUserMsg).then(aiTitle => {
        if (aiTitle) {
          window.electronAPI?.renameSession(sessionId, aiTitle);
          window.dispatchEvent(new CustomEvent('session-saved'));
        }
      }).catch(() => {});
    }
  } catch { /* */ }
}

export const useChatStore = create<ChatState>((set, get) => ({
  activeId: null,
  sessions: {},
  focusVersion: 0,

  addEntry(entry) {
    set(state => updateSession(state, state.activeId || 'default', ses => ({
      ...ses, entries: [...ses.entries, entry],
    })));
  },

  appendDelta(text) {
    set(state => updateSession(state, state.activeId || 'default', ses => ({
      ...ses, streamingText: ses.streamingText + text,
    })));
  },

  finishStream(text) {
    set(state => {
      const id = state.activeId || 'default';
      const ses = state.sessions[id] || emptySession();
      const finalText = text || ses.streamingText;
      const newEntries = [...ses.entries, { id: String(Date.now()), role: 'assistant' as const, content: finalText, timestamp: Date.now() }];
      autoSave(id, newEntries);
      return updateSession(state, id, s => ({
        ...s,
        entries: newEntries,
        streamingText: '',
        isStreaming: false,
        runStartedAt: null,
      }));
    });
    // Auto-focus input after response
    set(s => ({ focusVersion: s.focusVersion + 1 }));
  },

  setStreaming(v) {
    set(state => updateSession(state, state.activeId || 'default', ses => ({
      ...ses,
      isStreaming: v,
      streamingText: v ? '' : ses.streamingText,
      error: v ? null : ses.error,
      runStartedAt: v ? (ses.runStartedAt || Date.now()) : null,
    })));
  },

  setError(msg) {
    set(state => updateSession(state, state.activeId || 'default', ses => ({ ...ses, error: msg, isStreaming: false, runStartedAt: null })));
  },

  setPendingContext(text) {
    set(state => updateSession(state, state.activeId || 'default', ses => ({ ...ses, pendingContext: text })));
  },

  triggerFocus() {
    set(s => ({ focusVersion: s.focusVersion + 1 }));
  },

  addEntryTo(sid, entry) {
    set(state => updateSession(state, sid, ses => ({ ...ses, entries: [...ses.entries, entry], error: null })));
  },

  appendDeltaTo(sid, text) {
    set(state => updateSession(state, sid, ses => (
      ses.isStreaming ? { ...ses, streamingText: ses.streamingText + text } : ses
    )));
  },

  finishStreamTo(sid, text) {
    set(state => {
      const ses = state.sessions[sid] || emptySession();
      const newEntries = [...ses.entries, { id: String(Date.now()), role: 'assistant' as const, content: text || ses.streamingText, timestamp: Date.now() }];
      autoSave(sid, newEntries);
      return updateSession(state, sid, s => ({
        ...s,
        entries: newEntries,
        streamingText: '',
        isStreaming: false,
        error: null,
        runStartedAt: null,
      }));
    });
    set(s => ({ focusVersion: s.focusVersion + 1 }));
  },

  setStreamingTo(sid, v) {
    set(state => updateSession(state, sid, ses => ({
      ...ses,
      isStreaming: v,
      streamingText: v ? '' : ses.streamingText,
      error: v ? null : ses.error,
      runStartedAt: v ? (ses.runStartedAt || Date.now()) : null,
    })));
  },

  setErrorTo(sid, msg) {
    set(state => updateSession(state, sid, ses => ({ ...ses, error: msg, isStreaming: false, runStartedAt: null })));
  },

  ensureActiveSession() {
    const existing = get().activeId;
    if (existing) {
      currentSessionId = existing;
      return existing;
    }

    const id = createSessionId();
    currentSessionId = id;
    set(state => ({
      ...state,
      activeId: id,
      sessions: { ...state.sessions, [id]: emptySession() },
    }));
    return id;
  },

  startNew() {
    currentSessionId = null;
    set(state => {
      const { default: _defaultSession, ...rest } = state.sessions;
      return { ...state, activeId: null, sessions: rest };
    });
  },

  switchTo(id) {
    currentSessionId = id;
    set(state => ({
      ...state,
      activeId: id,
      sessions: state.sessions[id] ? state.sessions : { ...state.sessions, [id]: emptySession() },
    }));
  },

  loadEntries(id, entries) {
    currentSessionId = id;
    titlesGenerated.add(id);
    set(state => ({
      ...state,
      activeId: id,
      sessions: { ...state.sessions, [id]: { ...emptySession(), entries } },
    }));
  },

  removeSession(id) {
    titlesGenerated.delete(id);
    if (currentSessionId === id) currentSessionId = null;
    set(state => {
      const { [id]: _removed, ...rest } = state.sessions;
      return {
        ...state,
        activeId: state.activeId === id ? null : state.activeId,
        sessions: rest,
      };
    });
  },

  clearActive() {
    currentSessionId = null;
    set(state => {
      const id = state.activeId || 'default';
      const { [id]: _, ...rest } = state.sessions;
      return { activeId: null, sessions: rest };
    });
  },
}));

const EMPTY: ChatEntry[] = [];

export function useActiveEntries(): ChatEntry[] {
  return useChatStore(s => {
    const id = s.activeId;
    if (!id) return EMPTY;
    const ses = s.sessions[id];
    return ses ? ses.entries : EMPTY;
  });
}

export function useActiveStreamingText(): string {
  return useChatStore(s => {
    const id = s.activeId;
    if (!id) return '';
    const ses = s.sessions[id];
    return ses ? ses.streamingText : '';
  });
}

export function useActiveIsStreaming(): boolean {
  return useChatStore(s => {
    const id = s.activeId;
    if (!id) return false;
    const ses = s.sessions[id];
    return ses ? ses.isStreaming : false;
  });
}

export function useActiveRunStartedAt(): number | null {
  return useChatStore(s => {
    const id = s.activeId;
    if (!id) return null;
    const ses = s.sessions[id];
    return ses ? ses.runStartedAt : null;
  });
}

export function useActiveError(): string | null {
  return useChatStore(s => {
    const id = s.activeId;
    if (!id) return null;
    const ses = s.sessions[id];
    return ses ? ses.error : null;
  });
}

export function useActivePendingContext(): string | null {
  return useChatStore(s => {
    const id = s.activeId;
    if (!id) return null;
    const ses = s.sessions[id];
    return ses ? ses.pendingContext : null;
  });
}

export function resetSessionId() {
  currentSessionId = null;
}

export function getSessionId(): string | null {
  return currentSessionId;
}

export function setSessionId(id: string) {
  currentSessionId = id;
  titlesGenerated.add(id);
}
