import { create } from 'zustand';

interface AppState {
  showSidebar: boolean;
  showSessions: boolean;
  showTerminal: boolean;
  currentModel: string;
  availableModels: string[];
  contextLimit: number | null;
  compareMode: boolean;
  compareModels: string[];
  leftWidth: number;
  rightWidth: number;

  toggleSidebar: () => void;
  toggleSessions: () => void;
  toggleTerminal: () => void;
  setModel: (model: string) => void;
  setAvailableModels: (models: string[]) => void;
  setContextLimit: (limit: number | null) => void;
  toggleCompareMode: () => void;
  setCompareModels: (models: string[]) => void;
  setLeftWidth: (w: number) => void;
  setRightWidth: (w: number) => void;
}

export const useAppStore = create<AppState>((set) => ({
  showSidebar: false,
  showSessions: true,
  currentModel: 'deepseek-v4-pro',
  availableModels: ['deepseek-v4-pro', 'deepseek-v4-flash'],
  contextLimit: null,
  compareMode: false,
  compareModels: ['deepseek-v4-pro', 'deepseek-v4-flash'],
  leftWidth: 220,
  rightWidth: 420,

  toggleSidebar: () => set(s => ({ showSidebar: !s.showSidebar })),
  toggleSessions: () => set(s => ({ showSessions: !s.showSessions })),
  toggleTerminal: () => set(s => ({ showTerminal: !s.showTerminal })),
  setModel: (model) => set({ currentModel: model }),
  setAvailableModels: (models) => set({ availableModels: models }),
  setContextLimit: (limit) => set({ contextLimit: limit }),
  toggleCompareMode: () => set(s => ({ compareMode: !s.compareMode })),
  setCompareModels: (models) => set({ compareModels: models }),
  setLeftWidth: (w) => set(s => ({ leftWidth: Math.max(160, Math.min(500, s.leftWidth + w)) })),
  setRightWidth: (w) => set(s => ({ rightWidth: Math.max(300, Math.min(800, s.rightWidth + w)) })),
}));
