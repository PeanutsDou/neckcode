// @ts-nocheck
import { contextBridge, ipcRenderer } from 'electron';

console.log('[preload] loading...');

const api = {
  // Agent
  sendMessage: (sessionId: string, text: string, attachments?: { type: string; data: string; mimeType: string }[]) => {
    return ipcRenderer.invoke('agent:send-message', sessionId, text, attachments || []);
  },
  regenerate: (sessionId: string, text: string, attachments?: { type: string; data: string; mimeType: string }[]) => {
    return ipcRenderer.invoke('agent:regenerate', sessionId, text, attachments || []);
  },
  abort: (sessionId: string) => ipcRenderer.invoke('agent:abort', sessionId),
  resetAgent: (sessionId: string) => ipcRenderer.invoke('agent:reset', sessionId),
  setAgentContext: (sessionId: string, messages: unknown[], modelId?: string) => ipcRenderer.invoke('agent:set-context', sessionId, messages, modelId),
  getAgentContextStatus: (sessionId: string) => ipcRenderer.invoke('agent:get-context-status', sessionId),
  refreshAgentContextStatus: (sessionId: string) => ipcRenderer.invoke('agent:refresh-context-status', sessionId),
  setSessionModel: (sessionId: string, modelId: string) => ipcRenderer.invoke('session:set-model', sessionId, modelId),

  // Agent events
  onDelta: (cb: (sid: string, text: string) => void) => {
    const listener = (_event: unknown, sid: string, text: string) => cb(sid, text);
    ipcRenderer.on('agent:delta', listener);
    return () => { ipcRenderer.removeListener('agent:delta', listener); };
  },
  onThinkingDelta: (cb: (sid: string, text: string) => void) => {
    const listener = (_event: unknown, sid: string, text: string) => cb(sid, text);
    ipcRenderer.on('agent:thinking-delta', listener);
    return () => { ipcRenderer.removeListener('agent:thinking-delta', listener); };
  },
  onToolStart: (cb: (sid: string, data: unknown) => void) => {
    const listener = (_event: unknown, sid: string, data: unknown) => cb(sid, data);
    ipcRenderer.on('agent:tool-start', listener);
    return () => { ipcRenderer.removeListener('agent:tool-start', listener); };
  },
  onToolResult: (cb: (sid: string, data: unknown) => void) => {
    const listener = (_event: unknown, sid: string, data: unknown) => cb(sid, data);
    ipcRenderer.on('agent:tool-result', listener);
    return () => { ipcRenderer.removeListener('agent:tool-result', listener); };
  },
  onTurnDone: (cb: (sid: string, data: unknown) => void) => {
    const listener = (_event: unknown, sid: string, data: unknown) => cb(sid, data);
    ipcRenderer.on('agent:turn-done', listener);
    return () => { ipcRenderer.removeListener('agent:turn-done', listener); };
  },
  onRunStatus: (cb: (sid: string, status: unknown) => void) => {
    const listener = (_event: unknown, sid: string, status: unknown) => cb(sid, status);
    ipcRenderer.on('agent:run-status', listener);
    return () => { ipcRenderer.removeListener('agent:run-status', listener); };
  },
  onQueuedMessageStart: (cb: (sid: string, data: unknown) => void) => {
    const listener = (_event: unknown, sid: string, data: unknown) => cb(sid, data);
    ipcRenderer.on('agent:queued-message-start', listener);
    return () => { ipcRenderer.removeListener('agent:queued-message-start', listener); };
  },
  onQueuedCount: (cb: (sid: string, count: number) => void) => {
    const listener = (_event: unknown, sid: string, count: number) => cb(sid, count);
    ipcRenderer.on('agent:queued-count', listener);
    return () => { ipcRenderer.removeListener('agent:queued-count', listener); };
  },
  onError: (cb: (sid: string, error: unknown) => void) => {
    const listener = (_event: unknown, sid: string, error: unknown) => cb(sid, error);
    ipcRenderer.on('agent:error', listener);
    return () => { ipcRenderer.removeListener('agent:error', listener); };
  },

  // Config
  getConfig: () => ipcRenderer.invoke('config:get'),
  setConfig: (key: string, value: unknown) => ipcRenderer.invoke('config:set', key, value),
  getProviders: () => ipcRenderer.invoke('config:get-providers'),
  setProvider: (pc: unknown) => ipcRenderer.invoke('config:set-provider', pc),
  deleteProvider: (id: string) => ipcRenderer.invoke('config:delete-provider', id),
  testProvider: (config: unknown) => ipcRenderer.invoke('provider:test', config),
  getDeepSeekBalance: () => ipcRenderer.invoke('balance:query', 'deepseek'),
  getProviderBalance: (providerId: string) => ipcRenderer.invoke('balance:query', providerId),

  // File system
  listDir: (dirPath: string) => ipcRenderer.invoke('fs:list-dir', dirPath),
  readFile: (filePath: string) => ipcRenderer.invoke('fs:read-file', filePath),
  writeFile: (filePath: string, content: string) => ipcRenderer.invoke('fs:write-file', filePath, content),

  // Window controls
  minimize: () => ipcRenderer.invoke('window:minimize'),
  maximize: () => ipcRenderer.invoke('window:maximize'),
  close: () => ipcRenderer.invoke('window:close'),
  setAlwaysOnTop: (enabled: boolean) => ipcRenderer.invoke('window:set-always-on-top', enabled),
  getAlwaysOnTop: () => ipcRenderer.invoke('window:get-always-on-top'),

  // QuickLauncher
  quickLauncherShow: () => ipcRenderer.invoke('quick-launcher:show'),
  quickLauncherHide: () => ipcRenderer.invoke('quick-launcher:hide'),
  quickLauncherToggle: () => ipcRenderer.invoke('quick-launcher:toggle'),
  quickLauncherGetState: () => ipcRenderer.invoke('quick-launcher:get-state'),
  quickLauncherSetMode: (mode: 'chat' | 'find') => ipcRenderer.invoke('quick-launcher:set-mode', mode),
  quickLauncherSetExpanded: (expanded: boolean) => ipcRenderer.invoke('quick-launcher:set-expanded', expanded),
  onQuickLauncherShow: (cb: () => void) => {
    const listener = () => cb();
    ipcRenderer.on('quick-launcher:shown', listener);
    return () => { ipcRenderer.removeListener('quick-launcher:shown', listener); };
  },
  onQuickLauncherHide: (cb: () => void) => {
    const listener = () => cb();
    ipcRenderer.on('quick-launcher:hidden', listener);
    return () => { ipcRenderer.removeListener('quick-launcher:hidden', listener); };
  },
  quickChatSend: (message: string) => ipcRenderer.invoke('quick-chat:send', message),
  quickChatAbort: () => ipcRenderer.invoke('quick-chat:abort'),
  quickChatClear: () => ipcRenderer.invoke('quick-chat:clear'),
  quickChatSaveSession: () => ipcRenderer.invoke('quick-chat:save-session'),
  onQuickChatUser: (cb: (entry: unknown) => void) => {
    const listener = (_: unknown, entry: unknown) => cb(entry);
    ipcRenderer.on('quick-chat:user', listener);
    return () => { ipcRenderer.removeListener('quick-chat:user', listener); };
  },
  onQuickChatDelta: (cb: (text: string) => void) => {
    const listener = (_: unknown, text: string) => cb(text);
    ipcRenderer.on('quick-chat:delta', listener);
    return () => { ipcRenderer.removeListener('quick-chat:delta', listener); };
  },
  onQuickChatDone: (cb: (data: unknown) => void) => {
    const listener = (_: unknown, data: unknown) => cb(data);
    ipcRenderer.on('quick-chat:done', listener);
    return () => { ipcRenderer.removeListener('quick-chat:done', listener); };
  },
  onQuickChatRunStatus: (cb: (status: unknown) => void) => {
    const listener = (_: unknown, status: unknown) => cb(status);
    ipcRenderer.on('quick-chat:run-status', listener);
    return () => { ipcRenderer.removeListener('quick-chat:run-status', listener); };
  },
  onQuickChatToolStart: (cb: (entry: unknown) => void) => {
    const listener = (_: unknown, entry: unknown) => cb(entry);
    ipcRenderer.on('quick-chat:tool-start', listener);
    return () => { ipcRenderer.removeListener('quick-chat:tool-start', listener); };
  },
  onQuickChatToolResult: (cb: (data: unknown) => void) => {
    const listener = (_: unknown, data: unknown) => cb(data);
    ipcRenderer.on('quick-chat:tool-result', listener);
    return () => { ipcRenderer.removeListener('quick-chat:tool-result', listener); };
  },
  onQuickChatError: (cb: (error: unknown) => void) => {
    const listener = (_: unknown, error: unknown) => cb(error);
    ipcRenderer.on('quick-chat:error', listener);
    return () => { ipcRenderer.removeListener('quick-chat:error', listener); };
  },
  onQuickChatCleared: (cb: () => void) => {
    const listener = () => cb();
    ipcRenderer.on('quick-chat:cleared', listener);
    return () => { ipcRenderer.removeListener('quick-chat:cleared', listener); };
  },
  onQuickChatSaved: (cb: (data: unknown) => void) => {
    const listener = (_: unknown, data: unknown) => cb(data);
    ipcRenderer.on('quick-chat:saved', listener);
    return () => { ipcRenderer.removeListener('quick-chat:saved', listener); };
  },
  onQuickChatSaveError: (cb: (data: unknown) => void) => {
    const listener = (_: unknown, data: unknown) => cb(data);
    ipcRenderer.on('quick-chat:save-error', listener);
    return () => { ipcRenderer.removeListener('quick-chat:save-error', listener); };
  },
  quickFindLocalSearch: (query: string, favoritesList?: string[]) => ipcRenderer.invoke('quick-find:local-search', query, favoritesList),
  quickFindAgentSearch: (query: string) => ipcRenderer.invoke('quick-find:agent-search', query),
  quickFindOpen: (path: string, reveal?: boolean) => ipcRenderer.invoke('quick-find:open', path, reveal),
  clipboardWrite: (text: string) => ipcRenderer.invoke('clipboard:write', text),
  clipboardRead: () => ipcRenderer.invoke('clipboard:read'),
  quickFindReadFile: (path: string) => ipcRenderer.invoke('quick-find:read-file', path),
  clipboardWrite: (text: string) => ipcRenderer.invoke('clipboard:write', text),

  // Terminal
  startTerminal: () => ipcRenderer.invoke('terminal:start'),
  writeTerminal: (text: string) => ipcRenderer.invoke('terminal:write', text),
  stopTerminal: () => ipcRenderer.invoke('terminal:stop'),
  onTerminalData: (cb: (data: string) => void) => {
    const listener = (_: unknown, data: string) => cb(data);
    ipcRenderer.on('terminal:data', listener);
    return () => { ipcRenderer.removeListener('terminal:data', listener); };
  },

  // Session persistence
  saveSession: (session: unknown) => ipcRenderer.invoke('session:save', session),
  loadSession: (id: string) => ipcRenderer.invoke('session:load', id),
  listSessions: () => ipcRenderer.invoke('session:list'),
  onSessionSaved: (cb: (data: unknown) => void) => {
    const listener = (_: unknown, data: unknown) => cb(data);
    ipcRenderer.on('session:saved', listener);
    return () => { ipcRenderer.removeListener('session:saved', listener); };
  },
  deleteSession: (id: string) => ipcRenderer.invoke('session:delete', id),
  renameSession: (id: string, title: string) => ipcRenderer.invoke('session:rename', id, title),
  setSessionPinned: (id: string, pinned: boolean) => ipcRenderer.invoke('session:set-pinned', id, pinned),
  listSessionGroups: () => ipcRenderer.invoke('session-groups:list'),
  createSessionGroup: (name?: string) => ipcRenderer.invoke('session-groups:create', name),
  renameSessionGroup: (id: string, name: string) => ipcRenderer.invoke('session-groups:rename', id, name),
  setSessionGroupPinned: (id: string, pinned: boolean) => ipcRenderer.invoke('session-groups:set-pinned', id, pinned),
  setSessionGroupCollapsed: (id: string, collapsed: boolean) => ipcRenderer.invoke('session-groups:set-collapsed', id, collapsed),
  assignSessionGroup: (sessionId: string, groupId: string | null) => ipcRenderer.invoke('session-groups:assign-session', sessionId, groupId),
  deleteSessionGroup: (id: string) => ipcRenderer.invoke('session-groups:delete', id),
  generateTitle: (message: string) => ipcRenderer.invoke('session:generate-title', message),

  // Skills
  listSkills: () => ipcRenderer.invoke('skills:list'),
  reloadSkills: () => ipcRenderer.invoke('skills:reload'),
  invokeSkill: (name: string) => ipcRenderer.invoke('skills:invoke', name),
  writeSkillContent: (name: string, content: string) => ipcRenderer.invoke('skills:write-content', name, content),
  deleteSkill: (name: string) => ipcRenderer.invoke('skills:delete', name),

  // Agents
  listAgents: () => ipcRenderer.invoke('agents:list'),
  saveAgent: (agent: unknown) => ipcRenderer.invoke('agents:save', agent),
  deleteAgent: (agentId: string) => ipcRenderer.invoke('agents:delete', agentId),

  getAgentMd: () => ipcRenderer.invoke('agent-md:get'),
  listMemory: () => ipcRenderer.invoke('memory:list'),
  readMemory: (path: string) => ipcRenderer.invoke('memory:read', path),
  writeMemory: (path: string, content: string) => ipcRenderer.invoke('memory:write', path, content),
  deleteMemory: (path: string) => ipcRenderer.invoke('memory:delete', path),

  // Ask user question
  onAskShow: (cb: (sessionId: string, askId: string, questions: unknown[]) => void) => {
    const listener = (_: unknown, sessionId: string, askId: string, questions: unknown[]) => cb(sessionId, askId, questions);
    ipcRenderer.on('ask:show', listener);
    return () => { ipcRenderer.removeListener('ask:show', listener); };
  },
  respondToAsk: (askId: string, answers: Record<string, string> | null) => {
    return ipcRenderer.invoke('ask:respond', askId, answers);
  },
  onConfirmShow: (cb: (sessionId: string, confirmId: string, request: unknown) => void) => {
    const listener = (_: unknown, sessionId: string, confirmId: string, request: unknown) => cb(sessionId, confirmId, request);
    ipcRenderer.on('confirm:show', listener);
    return () => { ipcRenderer.removeListener('confirm:show', listener); };
  },
  respondToConfirm: (confirmId: string, approved: boolean) => {
    return ipcRenderer.invoke('confirm:respond', confirmId, approved);
  },

  // Dialog
  pickDirectory: () => ipcRenderer.invoke('dialog:pick-dir'),

  // Permissions
  getPermissionMode: () => ipcRenderer.invoke('permission:get'),
  setPermissionMode: (mode: string) => ipcRenderer.invoke('permission:set', mode),

  // Close dialog
  onCloseAsk: (cb: () => void) => {
    const listener = () => cb();
    ipcRenderer.on('close:ask', listener);
    return () => ipcRenderer.removeListener('close:ask', listener);
  },
  closeChoice: (action: string, remember: boolean) => ipcRenderer.invoke('close:choice', action, remember),

  // Auto-update  // IM
  imConnect: (serverUrl?: string) => ipcRenderer.invoke('im:connect', serverUrl),
  imDisconnect: () => ipcRenderer.invoke('im:disconnect'),
  imGetAuthState: () => ipcRenderer.invoke('im:get-auth-state'),
  imRegister: (input: any) => ipcRenderer.invoke('im:register', input),
  imLogin: (input: any) => ipcRenderer.invoke('im:login', input),
  imLogout: () => ipcRenderer.invoke('im:logout'),
  imSearchUsers: (query: any) => ipcRenderer.invoke('im:search-users', query),
  imListFriends: () => ipcRenderer.invoke('im:list-friends'),
  imAddFriend: (userId: any) => ipcRenderer.invoke('im:add-friend', userId),
  imAcceptFriend: (userId: any) => ipcRenderer.invoke('im:accept-friend', userId),
  imRemoveFriend: (userId: any) => ipcRenderer.invoke('im:remove-friend', userId),
  imSendMessage: (input: any) => ipcRenderer.invoke('im:send-message', input),
  imListMessages: (peerUserId: any, options: any) => ipcRenderer.invoke('im:list-messages', peerUserId, options),
  imLoadHistory: (peerUserId: any, options: any) => ipcRenderer.invoke('im:load-history', peerUserId, options),
  imMarkRead: (messageId: any) => ipcRenderer.invoke('im:mark-read', messageId),
  imListConversations: () => ipcRenderer.invoke('im:list-conversations'),
  imClearUnread: (peerUserId: any) => ipcRenderer.invoke('im:clear-unread', peerUserId),

  // IM events
  onImAuthState: (cb: any) => { const l = (_, s) => cb(s); ipcRenderer.on('im:auth-state', l); return () => ipcRenderer.removeListener('im:auth-state', l); },
  onImConnectionState: (cb: any) => { const l = (_, s) => cb(s); ipcRenderer.on('im:connection-state', l); return () => ipcRenderer.removeListener('im:connection-state', l); },
  onImFriendsUpdated: (cb: any) => { const l = (_, d) => cb(d); ipcRenderer.on('im:friends-updated', l); return () => ipcRenderer.removeListener('im:friends-updated', l); },
  onImFriendRequest: (cb: any) => { const l = (_, d) => cb(d); ipcRenderer.on('im:friend-request', l); return () => ipcRenderer.removeListener('im:friend-request', l); },
  onImMessageNew: (cb: any) => { const l = (_, d) => cb(d); ipcRenderer.on('im:message-new', l); return () => ipcRenderer.removeListener('im:message-new', l); },
  onImMessageUpdated: (cb: any) => { const l = (_, d) => cb(d); ipcRenderer.on('im:message-updated', l); return () => ipcRenderer.removeListener('im:message-updated', l); },
  onImConversationUpdated: (cb: any) => { const l = (_, d) => cb(d); ipcRenderer.on('im:conversation-updated', l); return () => ipcRenderer.removeListener('im:conversation-updated', l); },
  onImPresence: (cb: any) => { const l = (_, d) => cb(d); ipcRenderer.on('im:presence', l); return () => ipcRenderer.removeListener('im:presence', l); },
  onImError: (cb: any) => { const l = (_, d) => cb(d); ipcRenderer.on('im:error', l); return () => ipcRenderer.removeListener('im:error', l); },

  // Auto-update
  onUpdateAvailable: (cb: (version: string) => void) => {
    const listener = (_: unknown, version: string) => cb(version);
    ipcRenderer.on('update:available', listener);
    return () => ipcRenderer.removeListener('update:available', listener);
  },
  onUpdateProgress: (cb: (pct: number) => void) => {
    const listener = (_: unknown, pct: number) => cb(pct);
    ipcRenderer.on('update:progress', listener);
    return () => ipcRenderer.removeListener('update:progress', listener);
  },
  onUpdateDownloaded: (cb: () => void) => {
    const listener = () => cb();
    ipcRenderer.on('update:downloaded', listener);
    return () => ipcRenderer.removeListener('update:downloaded', listener);
  },
  checkForUpdates: () => ipcRenderer.invoke('update:check'),
  downloadUpdate: () => ipcRenderer.invoke('update:download'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
};
contextBridge.exposeInMainWorld('electronAPI', api);
console.log('[preload] electronAPI exposed');
