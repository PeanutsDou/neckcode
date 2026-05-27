import React, { useEffect, useState } from 'react';

export function CloseDialog() {
  const [visible, setVisible] = useState(false);
  const [remember, setRemember] = useState(false);
  const [autoLaunch, setAutoLaunch] = useState(false);

  useEffect(() => {
    const api = window.electronAPI as any;
    if (!api?.onCloseAsk) return;
    const unsub = api.onCloseAsk(() => {
      api.getAutoLaunch?.().then((enabled: boolean) => setAutoLaunch(Boolean(enabled))).catch(() => {});
      setVisible(true);
    });
    return () => unsub?.();
  }, []);

  const handleChoice = (action: 'tray' | 'quit') => {
    setVisible(false);
    (window.electronAPI as any).closeChoice(action, remember, autoLaunch);
  };

  if (!visible) return null;

  return (
    <div className="close-dialog-overlay">
      <div className="close-dialog">
        <h3>关闭 Neck Code</h3>
        <p>选择关闭方式：</p>
        <div className="close-dialog-buttons">
          <button className="btn btn-send" onClick={() => handleChoice('tray')}>
            最小化到托盘
          </button>
          <button className="msg-action-btn" onClick={() => handleChoice('quit')}>
            直接退出
          </button>
        </div>
        <label className="close-dialog-remember">
          <input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} />
          记住我的选择，不再询问
        </label>
        <label className="close-dialog-remember">
          <input type="checkbox" checked={autoLaunch} onChange={e => setAutoLaunch(e.target.checked)} />
          开机自启动（后台启动并最小化到托盘）
        </label>
      </div>
    </div>
  );
}
