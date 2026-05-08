export interface FileEntry {
  name: string;
  path: string;
  isDir: boolean;
}

export interface ElectronAPI {
  // Agent
  sendMessage: (text: string, attachments?: { type: string; data: string; mimeType: string }[]) => Promise<unknown>;
  abort: () => Promise<void>;
  compare: (text: string, models: string[]) => Promise<{ model: string; text: string; error?: string }[]>;

  // Window controls
  minimize: () => Promise<void>;
  maximize: () => Promise<void>;
  close: () => Promise<void>;

  // Agent events (returns unsubscribe function)
  onDelta: (cb: (text: string) => void) => () => void;
  onToolStart: (cb: (data: unknown) => void) => () => void;
  onToolResult: (cb: (data: unknown) => void) => () => void;
  onTurnDone: (cb: (data: unknown) => void) => () => void;
  onError: (cb: (msg: string) => void) => () => void;

  // Config
  getConfig: () => Promise<{ provider: string; model: string; models: string[]; workspaceRoot: string }>;
  setConfig: (key: string, value: unknown) => Promise<void>;
  getProviders: () => Promise<unknown[]>;
  setProvider: (id: string, config: unknown) => Promise<void>;

  // File system (direct)
  listDir: (dirPath: string) => Promise<FileEntry[]>;
  readFile: (filePath: string) => Promise<string>;
  writeFile: (filePath: string, content: string) => Promise<void>;

  // Session persistence
  saveSession: (session: unknown) => Promise<void>;
  loadSession: (id: string) => Promise<unknown>;
  listSessions: () => Promise<unknown[]>;
  deleteSession: (id: string) => Promise<void>;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
