import React, { useState, useEffect } from 'react';

export function UpdateBanner() {
  const [status, setStatus] = useState<'idle' | 'available' | 'downloading' | 'downloaded'>('idle');
  const [version, setVersion] = useState('');

  useEffect(() => {
    const api = window.electronAPI;
    if (!api) return;

    const unsub1 = api.onUpdateAvailable((v) => {
      setVersion(v);
      setStatus('available');
    });

    const unsub2 = api.onUpdateDownloaded(() => {
      setStatus('downloaded');
    });

    return () => { unsub1(); unsub2(); };
  }, []);

  const handleDownload = async () => {
    setStatus('downloading');
    await window.electronAPI.downloadUpdate();
  };

  const handleInstall = () => {
    window.electronAPI.installUpdate();
  };

  if (status === 'idle') return null;

  return (
    <div className="update-banner">
      {status === 'available' && (
        <div className="update-banner-inner">
          <span className="update-banner-msg">v{version} 可用</span>
          <button className="settings-btn-sm" onClick={handleDownload}>下载</button>
        </div>
      )}
      {status === 'downloading' && (
        <span className="update-banner-msg">下载中...</span>
      )}
      {status === 'downloaded' && (
        <div className="update-banner-inner">
          <span className="update-banner-msg">已就绪</span>
          <button className="btn btn-send" onClick={handleInstall}>重启安装</button>
        </div>
      )}
    </div>
  );
}
