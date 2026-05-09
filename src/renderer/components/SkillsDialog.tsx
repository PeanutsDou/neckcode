import React, { useEffect, useState, useRef, useCallback } from 'react';

interface SkillInfo {
  name: string;
  description: string;
  whenToUse?: string;
  argumentHint?: string;
  userInvocable: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
}

export function SkillsDialog({ open, onClose }: Props) {
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [selected, setSelected] = useState<SkillInfo | null>(null);
  const [content, setContent] = useState('');
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [size, setSize] = useState({ w: 700, h: 520 });
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const dragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0, px: 0, py: 0 });

  useEffect(() => {
    if (!open) { setSelected(null); return; }
    if (pos.x === 0 && pos.y === 0) {
      setPos({ x: Math.round(window.innerWidth / 2 - size.w / 2), y: Math.round(window.innerHeight / 2 - size.h / 2) });
    }
    loadSkills();
  }, [open]);

  const loadSkills = async () => {
    try {
      const list = await window.electronAPI?.listSkills();
      setSkills(list as SkillInfo[] || []);
    } catch { /* */ }
  };

  const viewSkill = async (skill: SkillInfo) => {
    setSelected(skill);
    setEditing(false);
    setSaved(false);
    try {
      const text = await window.electronAPI?.invokeSkill(skill.name);
      if (text) {
        const idx = text.indexOf('\n\n');
        setContent(idx > 0 ? text.slice(idx + 2) : text);
      } else {
        setContent('');
      }
    } catch {
      setContent('(无法加载技能内容)');
    }
  };

  const handleDelete = async (name: string) => {
    try {
      await (window.electronAPI as any).deleteSkill?.(name);
      if (selected?.name === name) { setSelected(null); setContent(''); }
      loadSkills();
      setDeleteConfirm(null);
    } catch { /* */ }
  };

  const handleSave = async () => {
    if (!selected || !content.trim()) return;
    try {
      await (window.electronAPI as any).writeSkillContent?.(selected.name, content);
      setSaved(true);
      setEditing(false);
      setTimeout(() => setSaved(false), 1500);
    } catch { /* */ }
  };

  const onDragStart = useCallback((e: React.MouseEvent) => {
    dragging.current = true;
    dragStart.current = { x: e.clientX, y: e.clientY, px: pos.x, py: pos.y };
    const onMove = (ev: MouseEvent) => {
      if (!dragging.current) return;
      setPos({ x: dragStart.current.px + ev.clientX - dragStart.current.x, y: dragStart.current.py + ev.clientY - dragStart.current.y });
    };
    const onUp = () => { dragging.current = false; document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [pos]);

  const onResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    const sx = e.clientX, sy = e.clientY, sw = size.w, sh = size.h;
    const onMove = (ev: MouseEvent) => {
      setSize({ w: Math.max(500, sw + ev.clientX - sx), h: Math.max(360, sh + ev.clientY - sy) });
    };
    const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [size]);

  if (!open) return null;

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="md-dialog" onClick={e => e.stopPropagation()} style={{ left: pos.x, top: pos.y, width: size.w, height: size.h }}>
        <div className="md-header" onMouseDown={onDragStart}>
          <h2>技能库</h2>
          <button className="settings-close" onClick={onClose}>&times;</button>
        </div>

        <div className="md-body">
          <div className="md-list">
            <div className="md-section-title">已加载技能</div>
            {skills.length === 0 && (
              <div className="md-empty">
                暂无技能。<br />
                <span style={{ fontSize: 10 }}>
                  在 ~/.claude/skills/ 下添加 SKILL.md 即可加载
                </span>
              </div>
            )}
            {skills.map(s => (
              <div key={s.name}
                className={`md-item ${selected?.name === s.name ? 'selected' : ''}`}
                onClick={() => viewSkill(s)}>
                <span className="md-item-icon" style={{ background: '#b89a6e' }}>S</span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)' }}>{s.name}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.description}</div>
                </div>
                <button className="md-item-del" onClick={e => { e.stopPropagation(); setDeleteConfirm(s.name); }}
                  title="删除">×</button>
              </div>
            ))}
          </div>

          <div className="md-content">
            {!selected ? (
              <div className="md-placeholder">选择一个技能查看详情</div>
            ) : (
              <>
                <div className="md-content-header">
                  <span className="md-badge" style={{ background: 'rgba(184, 154, 110, 0.1)', color: '#b89a6e' }}>
                    技能 · 按需调用
                  </span>
                  <span className="md-content-name">{selected.name}</span>
                </div>

                {editing ? (
                  <textarea className="md-editor" value={content} onChange={e => setContent(e.target.value)} />
                ) : (
                  <pre className="md-preview">{content || '(空)'}</pre>
                )}

                <div className="md-actions">
                  {editing ? (
                    <>
                      <button className="btn btn-send" onClick={handleSave}>保存</button>
                      <button className="settings-btn-sm" onClick={() => { setEditing(false); viewSkill(selected); }}>取消</button>
                    </>
                  ) : (
                    <button className="btn btn-send" onClick={() => setEditing(true)}>编辑</button>
                  )}
                  {saved && <span className="settings-saved">已保存</span>}
                </div>
              </>
            )}
          </div>
        </div>

        <div className="md-resize-handle" onMouseDown={onResizeStart} />
      </div>

      {deleteConfirm && (
        <div className="settings-overlay" style={{ zIndex: 1010 }} onClick={() => setDeleteConfirm(null)}>
          <div className="settings-dialog" style={{ width: 360 }} onClick={e => e.stopPropagation()}>
            <div className="settings-header"><h2>确认删除</h2></div>
            <div className="settings-body">
              <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                确定删除技能「{deleteConfirm}」吗？此操作不可撤销。
              </p>
            </div>
            <div className="settings-footer">
              <button className="settings-btn-sm" onClick={() => setDeleteConfirm(null)}>取消</button>
              <button className="btn btn-stop" onClick={() => handleDelete(deleteConfirm)}>删除</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
