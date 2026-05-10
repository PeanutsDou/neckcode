import React, { useState, useEffect } from 'react';

export function UpdateBanner() {
  const [status, setStatus] = useState<'idle' | 'available' | 'downloading' | 'downloaded'>('idle');
  const [version, setVersion] = useState('');
  const [pct, setPct] = useState(0);

  useEffect(() => {
    const api = window.electronAPI;
    if (!api) return;

    const u1 = api.onUpdateAvailable((v) => {
      setVersion(v);
      setStatus('downloading');
    });

    const u2 = api.onUpdateProgress?.((p: number) => {
      setPct(p);
    });

    const u3 = api.onUpdateDownloaded(() => {
      setStatus('downloaded');
    });

    return () => { u1(); u2?.(); u3(); };
  }, []);

  const handleInstall = () => {
    window.electronAPI.installUpdate();
  };

  if (status === 'idle') return null;

  return (
    <div className="update-banner">
      {status === 'downloading' && (
        <div className="update-banner-inner">
          <span className="update-banner-msg">v{version} 下载中 {Math.round(pct)}%</span>
          <div className="update-progress-bar">
            <div className="update-progress-fill" style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}
      {status === 'downloaded' && (
        <div className="update-banner-inner">
          <span className="update-banner-msg">v{version} 已就绪</span>
          <button className="btn btn-send" onClick={handleInstall}>重启安装</button>
        </div>
      )}
    </div>
  );
}
