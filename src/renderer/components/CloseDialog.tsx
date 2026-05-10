import React, { useEffect, useState } from 'react';

export function CloseDialog() {
  const [visible, setVisible] = useState(false);
  const [remember, setRemember] = useState(false);

  useEffect(() => {
    const api = window.electronAPI as any;
    if (!api?.onCloseAsk) return;
    const unsub = api.onCloseAsk(() => setVisible(true));
    return () => unsub?.();
  }, []);

  const handleChoice = (action: 'tray' | 'quit') => {
    setVisible(false);
    (window.electronAPI as any).closeChoice(action, remember);
  };

  if (!visible) return null;

  return (
    <div className="close-dialog-overlay">
      <div className="close-dialog">
        <h3>关闭 DeepSeek Code</h3>
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
      </div>
    </div>
  );
}
