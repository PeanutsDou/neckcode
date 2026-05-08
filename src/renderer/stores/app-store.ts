import { create } from 'zustand';

interface AppState {
  showSidebar: boolean;
  showSessions: boolean;
  showTerminal: boolean;
  currentModel: string;
  availableModels: string[];

  toggleSidebar: () => void;
  toggleSessions: () => void;
  toggleTerminal: () => void;
  setModel: (model: string) => void;
  setAvailableModels: (models: string[]) => void;
}

export const useAppStore = create<AppState>((set) => ({
  showSidebar: false,
  showSessions: false,
  currentModel: 'deepseek-v4-pro',
  availableModels: ['deepseek-v4-pro', 'deepseek-v4-flash'],

  toggleSidebar: () => set(s => ({ showSidebar: !s.showSidebar })),
  toggleSessions: () => set(s => ({ showSessions: !s.showSessions })),
  toggleTerminal: () => set(s => ({ showTerminal: !s.showTerminal })),
  setModel: (model) => set({ currentModel: model }),
  setAvailableModels: (models) => set({ availableModels: models }),
}));
