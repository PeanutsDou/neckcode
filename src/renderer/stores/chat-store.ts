import { create } from 'zustand';

export interface ChatEntry {
  id: string;
  role: 'user' | 'assistant' | 'tool' | 'system';
  content: string;
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

  addEntry: (entry: ChatEntry) => void;
  appendDelta: (text: string) => void;
  finishStream: (text: string) => void;
  setStreaming: (v: boolean) => void;
  setError: (msg: string | null) => void;
  clear: () => void;
}

let nextId = 1;

export const useChatStore = create<ChatState>((set, get) => ({
  entries: [],
  isStreaming: false,
  streamingText: '',
  error: null,

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
  },

  setStreaming(v) {
    set({ isStreaming: v });
  },

  setError(msg) {
    set({ error: msg, isStreaming: false });
  },

  clear() {
    set({ entries: [], streamingText: '', error: null, isStreaming: false });
  },
}));
