import React, { useEffect, useState } from 'react';
import type { PermissionMode } from '../../shared/permissions';
import { PERMISSION_OPTIONS } from '../../shared/permissions';

export function PermissionToggle() {
  const [mode, setMode] = useState<PermissionMode>('default');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    window.electronAPI?.getPermissionMode().then(m => {
      if (m) setMode(m as PermissionMode);
    }).catch(() => {});
  }, []);

  const select = async (m: PermissionMode) => {
    setMode(m);
    setOpen(false);
    await window.electronAPI?.setPermissionMode(m);
  };

  const label = PERMISSION_OPTIONS.find(o => o.value === mode)?.label || '默认权限';

  return (
    <div className="perm-toggle">
      <button className="perm-toggle-btn" onClick={() => setOpen(!open)} title="权限模式">
        {label}
      </button>
      {open && (
        <div className="perm-toggle-dropdown">
          {PERMISSION_OPTIONS.map(opt => (
            <button
              key={opt.value}
              className={`perm-toggle-option ${opt.value === mode ? 'selected' : ''}`}
              onClick={() => select(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
