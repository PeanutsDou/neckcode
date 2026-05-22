import { create } from 'zustand';
import type {
  ImAuthState,
  ImConnectionState,
  ImFriend,
  ImFriendRequest,
  ImMessage,
  ImConversation,
  ImClientError,
  ImSearchUser,
} from '../../shared/im-types';

interface ImState {
  active: boolean;
  authState: ImAuthState;
  connectionState: ImConnectionState;
  friends: ImFriend[];
  requests: ImFriendRequest[];
  searchResults: ImSearchUser[];
  searchQuery: string;
  activePeerId: string | null;
  messages: Record<string, ImMessage[]>;
  conversations: ImConversation[];
  showSearch: boolean;
  showRequests: boolean;
  error: ImClientError | null;

  setActive: (v: boolean) => void;
  setAuthState: (state: ImAuthState) => void;
  setConnectionState: (state: ImConnectionState) => void;
  setFriends: (friends: ImFriend[], requests: ImFriendRequest[]) => void;
  addFriend: (friend: ImFriend) => void;
  removeFriend: (userId: string) => void;
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

const initialState = {
  active: false,
  authState: { status: 'loggedOut', user: null } as ImAuthState,
  connectionState: 'idle' as ImConnectionState,
  friends: [] as ImFriend[],
  requests: [] as ImFriendRequest[],
  searchResults: [] as ImSearchUser[],
  searchQuery: '',
  activePeerId: null as string | null,
  messages: {} as Record<string, ImMessage[]>,
  conversations: [] as ImConversation[],
  showSearch: false,
  showRequests: false,
  error: null as ImClientError | null,
};

function messageKey(message: ImMessage): string {
  return message.localId || message.messageId;
}

function upsertMessage(list: ImMessage[], message: ImMessage): ImMessage[] {
  const key = messageKey(message);
  if (!key) return [...list, message];
  const index = list.findIndex((m) => messageKey(m) === key || (!!message.localId && m.localId === message.localId) || (!!message.messageId && m.messageId === message.messageId));
  if (index < 0) return [...list, message].sort((a, b) => a.createdAt - b.createdAt);
  const next = [...list];
  next[index] = message;
  return next.sort((a, b) => a.createdAt - b.createdAt);
}

export const useImStore = create<ImState>((set) => ({
  ...initialState,

  setActive: (active) => set({ active }),
  setAuthState: (authState) => set({ authState }),
  setConnectionState: (connectionState) => set({ connectionState }),
  setFriends: (friends, requests) => set({ friends, requests }),

  addFriend: (friend) => set((s) => ({
    friends: [friend, ...s.friends.filter((f) => f.userId !== friend.userId)],
    requests: s.requests.filter((r) => r.userId !== friend.userId),
  })),

  removeFriend: (userId) => set((s) => ({
    friends: s.friends.filter((f) => f.userId !== userId),
    requests: s.requests.filter((r) => r.userId !== userId),
    conversations: s.conversations.filter((c) => c.peerUserId !== userId),
    activePeerId: s.activePeerId === userId ? null : s.activePeerId,
  })),

  addRequest: (request) => set((s) => ({
    requests: [request, ...s.requests.filter((r) => !(r.userId === request.userId && r.direction === request.direction))],
  })),

  removeRequest: (userId) => set((s) => ({
    requests: s.requests.filter((r) => r.userId !== userId),
  })),

  setSearchResults: (searchResults) => set({ searchResults }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setActivePeer: (activePeerId) => set({ activePeerId }),

  setMessages: (peerId, messages) => set((s) => ({
    messages: { ...s.messages, [peerId]: [...messages].sort((a, b) => a.createdAt - b.createdAt) },
  })),

  addMessage: (message) => set((s) => {
    const peerId = message.peerUserId;
    const existing = s.messages[peerId] || [];
    return { messages: { ...s.messages, [peerId]: upsertMessage(existing, message) } };
  }),

  updateMessage: (localId, message) => set((s) => {
    const peerId = message.peerUserId;
    const existing = s.messages[peerId] || [];
    const index = existing.findIndex((m) => m.localId === localId);
    const next = index >= 0 ? existing.map((m) => (m.localId === localId ? message : m)) : upsertMessage(existing, message);
    return { messages: { ...s.messages, [peerId]: next.sort((a, b) => a.createdAt - b.createdAt) } };
  }),

  setConversations: (conversations) => set({ conversations }),

  updateConversation: (conv) => set((s) => ({
    conversations: [conv, ...s.conversations.filter((c) => c.peerUserId !== conv.peerUserId)]
      .sort((a, b) => (b.lastMessageAt || 0) - (a.lastMessageAt || 0)),
  })),

  clearUnread: (peerId) => set((s) => ({
    conversations: s.conversations.map((c) => c.peerUserId === peerId ? { ...c, unreadCount: 0 } : c),
  })),

  updatePresence: (userId, online, lastSeenAt) => set((s) => ({
    friends: s.friends.map((f) => f.userId === userId ? { ...f, online, lastSeenAt: lastSeenAt ?? f.lastSeenAt } : f),
  })),

  setError: (error) => set({ error }),

  toggleSearch: () => set((s) => s.showSearch
    ? { showSearch: false, searchResults: [], searchQuery: '' }
    : { showSearch: true, showRequests: false }),

  toggleRequests: () => set((s) => s.showRequests
    ? { showRequests: false }
    : { showRequests: true, showSearch: false }),

  reset: () => set({ ...initialState }),
}));
