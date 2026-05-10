import React, { useState, useEffect, useRef } from 'react';

export function WorkspaceBar() {
  const [value, setValue] = useState('');
  const [saved, setSaved] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    window.electronAPI?.getConfig().then((c: any) => {
      setValue(c.workspaceRoot || '');
    }).catch(() => {});
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setValue(e.target.value);
  };

  const handleBrowse = async () => {
    const dir = await window.electronAPI?.pickDirectory?.();
    if (dir) {
      setValue(dir);
      window.electronAPI?.setConfig('workspaceRoot', dir);
      setSaved(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setSaved(false), 1500);
    }
  };

  const handleSave = () => {
    const v = value.trim();
    if (!v) { setValue(''); return; }
    window.electronAPI?.setConfig('workspaceRoot', v);
    setSaved(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setSaved(false), 1500);
  };

  return (
    <div className="workspace-bar">
      <input
        className="workspace-bar-input"
        value={value}
        onChange={handleChange}
        onBlur={handleSave}
        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        placeholder="工作区目录..."
        title="Agent 操作的工作区根目录"
      />
      <button className="workspace-bar-browse" onClick={handleBrowse} title="浏览选择目录">...</button>
      {saved && <span className="workspace-bar-saved">已保存</span>}
    </div>
  );
}
