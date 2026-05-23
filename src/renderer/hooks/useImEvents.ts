import { useEffect } from 'react';
import { useImStore } from '../stores/im-store';

async function loadFriends() {
  const result = await window.electronAPI?.imListFriends?.();
  if (result?.friends || result?.requests) {
    useImStore.getState().setFriends(result.friends || [], result.requests || []);
  }
}

async function loadConversations() {
  const result = await window.electronAPI?.imListConversations?.();
  if (result?.conversations) {
    useImStore.getState().setConversations(result.conversations);
  }
}

export function useImEvents() {
  useEffect(() => {
    const api = window.electronAPI;
    if (!api) return;
    const unsubs: Array<() => void> = [];

    unsubs.push(api.onImAuthState((state: any) => {
      const store = useImStore.getState();
      store.setAuthState(state);
      if (state.status === 'loggedIn') {
        void loadFriends();
        void loadConversations();
      } else {
        store.setFriends([], []);
        store.setConversations([]);
        store.setActivePeer(null);
      }
    }));

    unsubs.push(api.onImConnectionState((state: any) => {
      useImStore.getState().setConnectionState(state.state || state);
    }));

    unsubs.push(api.onImFriendsUpdated((data: any) => {
      useImStore.getState().setFriends(data.friends || [], data.requests || []);
      void loadConversations();
    }));

    unsubs.push(api.onImFriendRequest((data: any) => {
      if (data.request) useImStore.getState().addRequest(data.request);
    }));

    unsubs.push(api.onImMessageNew((data: any) => {
      if (data.message) useImStore.getState().addMessage(data.message);
    }));

    unsubs.push(api.onImMessageUpdated((data: any) => {
      if (data.localId && data.message) {
        useImStore.getState().updateMessage(data.localId, data.message);
      }
    }));

    unsubs.push(api.onImConversationUpdated((data: any) => {
      if (data.conversation) useImStore.getState().updateConversation(data.conversation);
    }));

    unsubs.push(api.onImPresence((data: any) => {
      useImStore.getState().updatePresence(data.userId, data.online, data.lastSeenAt);
    }));

    unsubs.push(api.onImError((data: any) => {
      useImStore.getState().setError(data.error || data);
    }));

    api.imGetAuthState().then((state: any) => {
      useImStore.getState().setAuthState(state);
      if (state.status === 'loggedIn') {
        void loadFriends();
        void loadConversations();
      }
    }).catch((err: unknown) => {
      useImStore.getState().setError({ code: 'AUTH_STATE_FAILED', message: String(err), source: 'client', retryable: true });
    });

    return () => unsubs.forEach((u) => u());
  }, []);
}
