import React, { useEffect } from 'react';
import { useImStore } from '../../stores/im-store';
import { LoginPage } from './LoginPage';
import { ConnectionBanner } from './ConnectionBanner';
import { FriendList } from './FriendList';
import { FriendSearchDialog } from './FriendSearchDialog';
import { FriendRequests } from './FriendRequests';
import { DirectChat } from './DirectChat';

async function loadFriends() {
  const result = await window.electronAPI!.imListFriends();
  if (result?.friends || result?.requests) {
    useImStore.getState().setFriends(result.friends || [], result.requests || []);
  }
}

async function loadConversations() {
  const result = await window.electronAPI!.imListConversations();
  if (result?.conversations) {
    useImStore.getState().setConversations(result.conversations);
  }
}

export function ImShell() {
  const authState = useImStore((s) => s.authState);
  const showSearch = useImStore((s) => s.showSearch);
  const showRequests = useImStore((s) => s.showRequests);

  useEffect(() => {
    const unsubs: Array<() => void> = [];

    unsubs.push(window.electronAPI!.onImAuthState((state: any) => {
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

    unsubs.push(window.electronAPI!.onImConnectionState((state: any) => {
      useImStore.getState().setConnectionState(state.state || state);
    }));

    unsubs.push(window.electronAPI!.onImFriendsUpdated((data: any) => {
      useImStore.getState().setFriends(data.friends || [], data.requests || []);
      void loadConversations();
    }));

    unsubs.push(window.electronAPI!.onImFriendRequest((data: any) => {
      if (data.request) useImStore.getState().addRequest(data.request);
    }));

    unsubs.push(window.electronAPI!.onImMessageNew((data: any) => {
      if (data.message) useImStore.getState().addMessage(data.message);
    }));

    unsubs.push(window.electronAPI!.onImMessageUpdated((data: any) => {
      if (data.localId && data.message) {
        useImStore.getState().updateMessage(data.localId, data.message);
      }
    }));

    unsubs.push(window.electronAPI!.onImConversationUpdated((data: any) => {
      if (data.conversation) useImStore.getState().updateConversation(data.conversation);
    }));

    unsubs.push(window.electronAPI!.onImPresence((data: any) => {
      useImStore.getState().updatePresence(data.userId, data.online, data.lastSeenAt);
    }));

    unsubs.push(window.electronAPI!.onImError((data: any) => {
      useImStore.getState().setError(data.error || data);
    }));

    return () => unsubs.forEach((u) => u());
  }, []);

  useEffect(() => {
    window.electronAPI!.imGetAuthState().then((state: any) => {
      useImStore.getState().setAuthState(state);
      if (state.status === 'loggedIn') {
        void loadFriends();
        void loadConversations();
      }
    }).catch((err: unknown) => {
      useImStore.getState().setError({ code: 'AUTH_STATE_FAILED', message: String(err), source: 'client', retryable: true });
    });
  }, []);

  if (authState.status === 'loggedOut') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-primary)' }}>
        <ConnectionBanner />
        <LoginPage />
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-primary)' }}>
      <ConnectionBanner />
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <div style={{ width: 252, flexShrink: 0, position: 'relative' }}>
          <FriendList />
          {showSearch && <FriendSearchDialog />}
          {showRequests && <FriendRequests />}
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <DirectChat />
        </div>
      </div>
    </div>
  );
}
