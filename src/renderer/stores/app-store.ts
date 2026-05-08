import { create } from 'zustand';

interface AppState {
  showSidebar: boolean;
  showSessions: boolean;
  showTerminal: boolean;
  currentModel: string;
  availableModels: string[];
  contextLimit: number | null;
  leftWidth: number;
  rightWidth: number;
  theme: 'light' | 'dark';

  toggleSidebar: () => void;
  toggleSessions: () => void;
  toggleTerminal: () => void;
  setModel: (model: string) => void;
  setAvailableModels: (models: string[]) => void;
  setContextLimit: (limit: number | null) => void;
  setLeftWidth: (w: number) => void;
  setRightWidth: (w: number) => void;
  setTheme: (t: 'light' | 'dark') => void;
}

export const useAppStore = create<AppState>((set) => ({
  showSidebar: false,
  showSessions: true,
  currentModel: 'deepseek-v4-pro',
  availableModels: ['deepseek-v4-pro', 'deepseek-v4-flash'],
  contextLimit: null,
  leftWidth: 220,
  rightWidth: 420,
  theme: 'light',

  toggleSidebar: () => set(s => ({ showSidebar: !s.showSidebar })),
  toggleSessions: () => set(s => ({ showSessions: !s.showSessions })),
  toggleTerminal: () => set(s => ({ showTerminal: !s.showTerminal })),
  setModel: (model) => set({ currentModel: model }),
  setAvailableModels: (models) => set({ availableModels: models }),
  setContextLimit: (limit) => set({ contextLimit: limit }),
  setLeftWidth: (w) => set(s => ({ leftWidth: Math.max(160, Math.min(500, s.leftWidth + w)) })),
  setRightWidth: (w) => set(s => ({ rightWidth: Math.max(300, Math.min(800, s.rightWidth + w)) })),
  setTheme: (theme) => set({ theme }),
}));
