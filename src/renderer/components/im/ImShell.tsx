import React from 'react';
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
