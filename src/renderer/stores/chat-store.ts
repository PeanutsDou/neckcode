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

interface ChatState {
  entries: ChatEntry[];
  isStreaming: boolean;
  streamingText: string;
  error: string | null;
  pendingContext: string | null;

  addEntry: (entry: ChatEntry) => void;
  appendDelta: (text: string) => void;
  finishStream: (text: string) => void;
  setStreaming: (v: boolean) => void;
  setError: (msg: string | null) => void;
  clear: () => void;
  setPendingContext: (text: string | null) => void;
}

let nextId = 1;
let currentSessionId: string | null = null;

function autoSave() {
  const state = useChatStore.getState();
  if (state.entries.length === 0) return;
  if (!currentSessionId) currentSessionId = Date.now().toString();

  const title = state.entries.find(e => e.role === 'user')?.content.slice(0, 50) || 'Untitled';
  window.electronAPI?.saveSession({
    id: currentSessionId,
    title,
    projectPath: '',
    modelId: '',
    messages: state.entries,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }).then(() => {
    // Notify session list to refresh
    window.dispatchEvent(new CustomEvent('session-saved'));
  }).catch(() => {});
}

export const useChatStore = create<ChatState>((set, get) => ({
  entries: [],
  isStreaming: false,
  streamingText: '',
  error: null,
  pendingContext: null,

  addEntry(entry) {
    set(state => ({
      entries: [...state.entries, entry],
    }));
  },

  appendDelta(text) {
    set(state => ({
      streamingText: state.streamingText + text,
    }));
  },

  finishStream(text) {
    const finalText = text || get().streamingText;
    set(state => ({
      entries: [
        ...state.entries,
        {
          id: String(nextId++),
          role: 'assistant',
          content: finalText,
          timestamp: Date.now(),
        },
      ],
      streamingText: '',
      isStreaming: false,
    }));
    // Auto-save after assistant response
    autoSave();
  },

  setStreaming(v) {
    set({ isStreaming: v });
  },

  setError(msg) {
    set({ error: msg, isStreaming: false });
  },

  clear() {
    currentSessionId = null;
    set({ entries: [], streamingText: '', error: null, isStreaming: false, pendingContext: null });
  },

  setPendingContext(text) {
    set({ pendingContext: text });
  },
}));

export function resetSessionId() {
  currentSessionId = null;
}
