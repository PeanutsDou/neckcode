import { create } from 'zustand';
import type {
  ImAuthState, ImConnectionState, ImUser, ImFriend, ImFriendRequest,
  ImMessage, ImConversation, ImClientError, ImSearchUser,
} from '../../shared/im-types';

// ─── Store State ───

interface ImState {
  // 模式
  active: boolean; // IM 模式是否激活

  // 认证
  authState: ImAuthState;
  connectionState: ImConnectionState;

  // 好友
  friends: ImFriend[];
  requests: ImFriendRequest[];
  searchResults: ImSearchUser[];
  searchQuery: string;

  // 聊天
  activePeerId: string | null;
  messages: Record<string, ImMessage[]>; // peerUserId → messages
  conversations: ImConversation[];

  // UI 状态
  showSearch: boolean;
  showRequests: boolean;
  error: ImClientError | null;

  // ─── Actions ───
  setActive: (v: boolean) => void;
  setAuthState: (state: ImAuthState) => void;
  setConnectionState: (state: ImConnectionState) => void;
  setFriends: (friends: ImFriend[], requests: ImFriendRequest[]) => void;
  addFriend: (friend: ImFriend) => void;
  addRequest: (request: ImFriendRequest) => void;
  removeRequest: (userId: string) => void;
  setSearchResults: (users: ImSearchUser[]) => void;
  setSearchQuery: (q: string) => void;
  setActivePeer: (peerId: string | null) => void;
  setMessages: (peerId: string, messages: ImMessage[]) => void;
  addMessage: (message: ImMessage) => void;
  updateMessage: (localId: string, message: ImMessage) => void;
  setConversations: (convs: ImConversation[]) => void;
  updateConversation: (conv: ImConversation) => void;
  clearUnread: (peerId: string) => void;
  updatePresence: (userId: string, online: boolean, lastSeenAt?: number) => void;
  setError: (error: ImClientError | null) => void;
  toggleSearch: () => void;
  toggleRequests: () => void;
  reset: () => void;
}

// ─── Initial State ───

const INITIAL: Omit<ImState, keyof ReturnType<typeof create>> = {
  active: false,
  authState: { status: 'loggedOut', user: null },
  connectionState: 'idle',
  friends: [],
  requests: [],
  searchResults: [],
  searchQuery: '',
  activePeerId: null,
  messages: {},
  conversations: [],
  showSearch: false,
  showRequests: false,
  error: null,
};

// ─── Store ───

export const useImStore = create<ImState>((set, get) => ({
  ...INITIAL,

  setActive: (v) => set({ active: v }),

  setAuthState: (authState) => set({ authState }),

  setConnectionState: (connectionState) => set({ connectionState }),

  setFriends: (friends, requests) => set({ friends, requests }),

  addFriend: (friend) => set((s) => ({
    friends: [...s.friends.filter((f) => f.userId !== friend.userId), friend],
    requests: s.requests.filter((r) => r.userId !== friend.userId),
  })),

  addRequest: (request) => set((s) => ({
    requests: [...s.requests.filter((r) => r.userId !== request.userId), request],
  })),

  removeRequest: (userId) => set((s) => ({
    requests: s.requests.filter((r) => r.userId !== userId),
  })),

  setSearchResults: (searchResults) => set({ searchResults }),

  setSearchQuery: (searchQuery) => set({ searchQuery }),

  setActivePeer: (activePeerId) => set({ activePeerId }),

  setMessages: (peerId, messages) => set((s) => ({
    messages: { ...s.messages, [peerId]: messages },
  })),

  addMessage: (message) => set((s) => {
    const peerId = message.peerUserId;
    const existing = s.messages[peerId] || [];
    // 去重
    const key = message.localId || message.messageId;
    if (existing.some((m) => (m.localId || m.messageId) === key)) return s;
    return {
      messages: { ...s.messages, [peerId]: [...existing, message] },
    };
  }),

  updateMessage: (localId, message) => set((s) => {
    const peerId = message.peerUserId;
    const existing = s.messages[peerId] || [];
    return {
      messages: {
        ...s.messages,
        [peerId]: existing.map((m) => (m.localId === localId ? message : m)),
      },
    };
  }),

  setConversations: (conversations) => set({ conversations }),

  updateConversation: (conv) => set((s) => ({
    conversations: [
      conv,
      ...s.conversations.filter((c) => c.peerUserId !== conv.peerUserId),
    ],
  })),

  clearUnread: (peerId) => set((s) => ({
    conversations: s.conversations.map((c) =>
      c.peerUserId === peerId ? { ...c, unreadCount: 0 } : c
    ),
  })),

  updatePresence: (userId, online, lastSeenAt) => set((s) => ({
    friends: s.friends.map((f) =>
      f.userId === userId ? { ...f, online, lastSeenAt: lastSeenAt ?? f.lastSeenAt } : f
    ),
  })),

  setError: (error) => set({ error }),

  toggleSearch: () => set((s) => {
    if (s.showSearch) return { showSearch: false, searchResults: [], searchQuery: '' };
    return { showSearch: true, showRequests: false };
  }),

  toggleRequests: () => set((s) => {
    if (s.showRequests) return { showRequests: false };
    return { showRequests: true, showSearch: false };
  }),

  reset: () => set({ ...INITIAL }),
}));
