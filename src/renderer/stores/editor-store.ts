import { create } from 'zustand';

export interface FileEntry {
  name: string;
  path: string;
  isDir: boolean;
}

interface EditorTab {
  path: string;
  name: string;
  content: string;
  isDirty: boolean;
}

interface EditorState {
  // File tree
  fileTree: FileEntry[];
  fileTreeLoading: boolean;
  currentDir: string;

  // Editor tabs
  tabs: EditorTab[];
  activeTab: string | null;

  // Selection to chat
  selectedText: string | null;

  // Actions
  loadFileTree: (dirPath: string) => Promise<void>;
  openFile: (filePath: string) => Promise<void>;
  closeTab: (filePath: string) => void;
  setActiveTab: (filePath: string) => void;
  updateContent: (filePath: string, content: string) => void;
  saveFile: (filePath: string) => Promise<void>;
  setSelectedText: (text: string | null) => void;
}

export const useEditorStore = create<EditorState>((set, get) => ({
  fileTree: [],
  fileTreeLoading: false,
  currentDir: '.',
  tabs: [],
  activeTab: null,
  selectedText: null,

  async loadFileTree(dirPath: string) {
    set({ fileTreeLoading: true });
    try {
      const result = await window.electronAPI.listDir(dirPath);
      set({ fileTree: result, currentDir: dirPath, fileTreeLoading: false });
    } catch {
      set({ fileTreeLoading: false });
    }
  },

  async openFile(filePath: string) {
    const existing = get().tabs.find(t => t.path === filePath);
    if (existing) {
      set({ activeTab: filePath });
      return;
    }
    try {
      const content = await window.electronAPI.readFile(filePath);
      const name = filePath.split(/[/\\]/).pop() || filePath;
      set(state => ({
        tabs: [...state.tabs, { path: filePath, name, content, isDirty: false }],
        activeTab: filePath,
      }));
    } catch (err) {
      console.error('Failed to open file:', err);
    }
  },

  closeTab(filePath: string) {
    set(state => {
      const newTabs = state.tabs.filter(t => t.path !== filePath);
      const newActive = state.activeTab === filePath
        ? (newTabs[newTabs.length - 1]?.path || null)
        : state.activeTab;
      return { tabs: newTabs, activeTab: newActive };
    });
  },

  setActiveTab(filePath: string) {
    set({ activeTab: filePath });
  },

  updateContent(filePath: string, content: string) {
    set(state => ({
      tabs: state.tabs.map(t =>
        t.path === filePath
          ? { ...t, content, isDirty: content !== t.content }
          : t
      ),
    }));
  },

  async saveFile(filePath: string) {
    const tab = get().tabs.find(t => t.path === filePath);
    if (!tab) return;
    await window.electronAPI.writeFile(filePath, tab.content);
    set(state => ({
      tabs: state.tabs.map(t =>
        t.path === filePath ? { ...t, isDirty: false } : t
      ),
    }));
  },

  setSelectedText(text: string | null) {
    set({ selectedText: text });
  },
}));
