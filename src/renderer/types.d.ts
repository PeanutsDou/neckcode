export interface FileEntry {
  name: string;
  path: string;
  isDir: boolean;
}

import type { AgentConfig, AgentError, ConfirmRequest, ProviderTestConfig, ProviderTestResult, RunStatusEvent } from '../shared/types';
import type { ImMessageAttachment } from '../shared/im-types';

export interface ElectronAPI {
  // Agent
  sendMessage: (sessionId: string, text: string, attachments?: { type: string; data: string; mimeType: string }[]) => Promise<unknown>;
  regenerate: (sessionId: string, text: string, attachments?: { type: string; data: string; mimeType: string }[]) => Promise<unknown>;
  abort: (sessionId: string) => Promise<void>;
  resetAgent: (sessionId: string) => Promise<void>;
  setAgentContext: (sessionId: string, messages: unknown[]) => Promise<void>;

  // Window controls
  minimize: () => Promise<void>;
  maximize: () => Promise<void>;
  close: () => Promise<void>;
  getAutoLaunch?: () => Promise<boolean>;
  setAutoLaunch?: (enabled: boolean) => Promise<boolean>;

  // Agent events (returns unsubscribe function)
  onDelta: (cb: (sid: string, text: string) => void) => () => void;
  onThinkingDelta: (cb: (sid: string, text: string) => void) => () => void;
  onToolStart: (cb: (sid: string, data: unknown) => void) => () => void;
  onToolResult: (cb: (sid: string, data: unknown) => void) => () => void;
  onTurnDone: (cb: (sid: string, data: unknown) => void) => () => void;
  onRunStatus: (cb: (sid: string, status: RunStatusEvent) => void) => () => void;
  onError: (cb: (sid: string, error: string | AgentError) => void) => () => void;

  // Config
  getConfig: () => Promise<{ model: string; models: string[]; activeProvider: string; providers: Array<{ id: string; name: string; models: string[] }>; workspaceRoot: string; maxTurns: number; maxTokens: number; baseUrl: string; theme?: 'light' | 'dark'; lightScheme?: string; fontScale?: number; codeLeftWidth?: number; autoLaunch?: boolean; quickLauncher?: { enabled: boolean; triggerWindowMs: number; inputAutoHideMs: number; panelAutoHideMs: number; mode: 'chat' | 'find'; modelId?: string; findMaxDepth?: number }; deepseekApiKey?: string; anthropicApiKey?: string }>;
  setConfig: (key: string, value: unknown) => Promise<void>;
  getProviders: () => Promise<unknown[]>;
  setProvider: (config: unknown) => Promise<void>;
  deleteProvider: (id: string) => Promise<void>;
  testProvider: (config: ProviderTestConfig) => Promise<ProviderTestResult>;

  // File system (direct)
  listDir: (dirPath: string) => Promise<FileEntry[]>;
  readFile: (filePath: string) => Promise<string>;
  writeFile: (filePath: string, content: string) => Promise<void>;

  // Session persistence
  saveSession: (session: unknown) => Promise<void>;
  loadSession: (id: string) => Promise<unknown>;
  listSessions: () => Promise<unknown[]>;
  onSessionSaved?: (cb: (data: unknown) => void) => () => void;
  deleteSession: (id: string) => Promise<void>;
  renameSession: (id: string, title: string) => Promise<boolean>;
  generateTitle: (message: string) => Promise<string | null>;

  // Skills
  listSkills: () => Promise<Array<{ name: string; description: string; whenToUse?: string; argumentHint?: string; userInvocable: boolean }>>;
  invokeSkill: (name: string) => Promise<string>;

  // Agents
  listAgents: () => Promise<AgentConfig[]>;
  saveAgent: (agent: AgentConfig) => Promise<void>;
  deleteAgent: (agentId: string) => Promise<void>;

  // Ask user question
  onAskShow: (cb: (sessionId: string, askId: string, questions: unknown[]) => void) => () => void;
  respondToAsk: (askId: string, answers: Record<string, string> | null) => Promise<void>;
  onConfirmShow: (cb: (sessionId: string, confirmId: string, request: string | ConfirmRequest) => void) => () => void;
  respondToConfirm: (confirmId: string, approved: boolean) => Promise<void>;

  // Terminal
  startTerminal: () => Promise<void>;
  writeTerminal: (text: string) => Promise<void>;
  stopTerminal: () => Promise<void>;
  onTerminalData: (cb: (data: string) => void) => () => void;

  // Dialog
  pickDirectory: () => Promise<string | null>;

  // Permissions
  getPermissionMode: () => Promise<string>;
  setPermissionMode: (mode: string) => Promise<void>;

  // Auto-update
  onUpdateAvailable: (cb: (version: string) => void) => () => void;
  onUpdateDownloaded: (cb: () => void) => () => void;
  checkForUpdates: () => Promise<{ version?: string; error?: string }>;
  downloadUpdate: () => Promise<{ ok?: boolean; error?: string }>;
  installUpdate: () => void;
  imSendMessage?: (input: { toUser: string; content: string; attachments?: ImMessageAttachment[] }) => Promise<unknown>;
  imListMessages?: (peerUserId: string, options?: unknown) => Promise<any>;
  imLoadHistory?: (peerUserId: string, options?: unknown) => Promise<any>;
  imMarkRead?: (messageId: string, fromUser?: string) => Promise<unknown>;
  imClearUnread?: (peerUserId: string) => Promise<unknown>;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
