import React, { useEffect } from 'react';
import { useImStore } from '../../stores/im-store';
import { LoginPage } from './LoginPage';
import { ConnectionBanner } from './ConnectionBanner';
import { FriendList } from './FriendList';
import { FriendSearchDialog } from './FriendSearchDialog';
import { FriendRequests } from './FriendRequests';
import { DirectChat } from './DirectChat';

export function ImShell() {
  const authState = useImStore((s) => s.authState);
  const showSearch = useImStore((s) => s.showSearch);
  const showRequests = useImStore((s) => s.showRequests);

  // ── 订阅主进程事件 ──

  useEffect(() => {
    const unsubs: (() => void)[] = [];

    // 认证状态
    unsubs.push(window.electronAPI!.onImAuthState((state: any) => {
      useImStore.getState().setAuthState(state);
      // 登录成功后加载好友列表和会话
      if (state.status === 'loggedIn') {
        loadFriends();
        loadConversations();
      }
    }));

    // 连接状态
    unsubs.push(window.electronAPI!.onImConnectionState((state: any) => {
      useImStore.getState().setConnectionState(state.state);
    }));

    // 好友更新
    unsubs.push(window.electronAPI!.onImFriendsUpdated((data: any) => {
      useImStore.getState().setFriends(data.friends || [], data.requests || []);
    }));

    // 好友申请
    unsubs.push(window.electronAPI!.onImFriendRequest((data: any) => {
      if (data.request) useImStore.getState().addRequest(data.request);
    }));

    // 新消息
    unsubs.push(window.electronAPI!.onImMessageNew((data: any) => {
      if (data.message) useImStore.getState().addMessage(data.message);
    }));

    // 消息状态更新
    unsubs.push(window.electronAPI!.onImMessageUpdated((data: any) => {
      if (data.localId && data.message) {
        useImStore.getState().updateMessage(data.localId, data.message);
      }
    }));

    // 在线状态
    unsubs.push(window.electronAPI!.onImPresence((data: any) => {
      useImStore.getState().updatePresence(data.userId, data.online, data.lastSeenAt);
    }));

    // 错误
    unsubs.push(window.electronAPI!.onImError((data: any) => {
      useImStore.getState().setError(data.error || data);
    }));

    return () => unsubs.forEach((u) => u());
  }, []);

  // ── 初始状态 ──

  useEffect(() => {
    window.electronAPI!.imGetAuthState().then((state: any) => {
      useImStore.getState().setAuthState(state);
      if (state.status === 'loggedIn') {
        loadFriends();
        loadConversations();
      }
    });
  }, []);

  const loadFriends = async () => {
    try {
      const result = await window.electronAPI!.imListFriends();
      if (result.friends || result.requests) {
        useImStore.getState().setFriends(result.friends || [], result.requests || []);
      }
    } catch { /* ignore */ }
  };

  const loadConversations = async () => {
    try {
      const result = await window.electronAPI!.imListConversations();
      if (result.conversations) {
        useImStore.getState().setConversations(result.conversations);
      }
    } catch { /* ignore */ }
  };

  // ── 渲染 ──

  if (authState.status === 'loggedOut') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <ConnectionBanner />
        <LoginPage />
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <ConnectionBanner />
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* 好友面板 */}
        <div style={{ width: 240, flexShrink: 0, position: 'relative' }}>
          <FriendList />
          {showSearch && <FriendSearchDialog />}
          {showRequests && <FriendRequests />}
        </div>

        {/* 聊天面板 */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <DirectChat />
        </div>
      </div>
    </div>
  );
}
