import React, { useEffect, useState, useRef, useCallback } from 'react';

interface MemoryFile {
  name: string;
  path: string;
  type: 'agent-md' | 'memory';
}

interface Props {
  open: boolean;
  onClose: () => void;
}

export function MemoryDialog({ open, onClose }: Props) {
  const [files, setFiles] = useState<MemoryFile[]>([]);
  const [selected, setSelected] = useState<MemoryFile | null>(null);
  const [content, setContent] = useState('');
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [size, setSize] = useState({ w: 700, h: 520 });
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const dragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0, px: 0, py: 0 });
  const resizing = useRef<'se' | null>(null);

  useEffect(() => {
    if (!open) { setSelected(null); return; }
    if (pos.x === 0 && pos.y === 0) {
      setPos({ x: Math.round(window.innerWidth / 2 - size.w / 2), y: Math.round(window.innerHeight / 2 - size.h / 2) });
    }
    loadFiles();
  }, [open]);

  const loadFiles = async () => {
    const list: MemoryFile[] = [];

    // AGENT.md
    try {
      const md = await (window.electronAPI as any).getAgentMd?.();
      if (md?.files) {
        for (const f of md.files as string[]) {
          const parts = f.replace(/\\/g, '/').split('/');
          list.push({ name: 'AGENT.md (' + parts.slice(-2).join('/') + ')', path: f, type: 'agent-md' });
        }
      }
    } catch { /* */ }

    // Memory files
    try {
      const mem = await (window.electronAPI as any).listMemory?.();
      if (Array.isArray(mem)) {
        for (const m of mem as Array<{ name: string; path: string }>) {
          list.push({ name: m.name, path: m.path, type: 'memory' });
        }
      }
    } catch { /* */ }

    setFiles(list);
  };

  const viewFile = async (file: MemoryFile) => {
    setSelected(file);
    setEditing(false);
    setSaved(false);
    try {
      const api = window.electronAPI as any;
      const text = await api.readMemory?.(file.path);
      setContent(typeof text === 'string' ? text : '(空)');
    } catch {
      setContent('(无法读取)');
    }
  };

  const handleDelete = async (file: MemoryFile) => {
    try {
      await (window.electronAPI as any).deleteMemory?.(file.path);
      if (selected?.path === file.path) { setSelected(null); setContent(''); }
      loadFiles();
      setDeleteConfirm(null);
    } catch { /* */ }
  };

  const handleSave = async () => {
    if (!selected) return;
    try {
      await (window.electronAPI as any).writeMemory?.(selected.path, content);
      setSaved(true);
      setEditing(false);
      setTimeout(() => setSaved(false), 1500);
    } catch { /* */ }
  };

  // Drag
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

  // Resize
  const onResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    resizing.current = 'se';
    const sx = e.clientX, sy = e.clientY, sw = size.w, sh = size.h;
    const onMove = (ev: MouseEvent) => {
      if (!resizing.current) return;
      setSize({ w: Math.max(500, sw + ev.clientX - sx), h: Math.max(360, sh + ev.clientY - sy) });
    };
    const onUp = () => { resizing.current = null; document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [size]);

  if (!open) return null;

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="md-dialog" onClick={e => e.stopPropagation()} style={{ left: pos.x, top: pos.y, width: size.w, height: size.h }}>
        <div className="md-header" onMouseDown={onDragStart}>
          <h2>记忆管理</h2>
          <button className="settings-btn-sm" onClick={async () => { setRefreshing(true); try { await window.electronAPI?.reloadSkills?.(); loadFiles(); } catch {} finally { setRefreshing(false); } }} style={{ marginRight: 8, fontSize: 11 }} disabled={refreshing}>{refreshing ? <span className="spinning" style={{display: "inline-block"}}>&#x27F3;</span> : "⟳"} {refreshing ? "刷新中..." : "刷新"}</button>
          <button className="settings-close" onClick={onClose}>&times;</button>
        </div>

        <div className="md-body">
          <div className="md-list">
            <div className="md-section-title">AGENT.md</div>
            {files.filter(f => f.type === 'agent-md').map(f => (
              <div key={f.path} className={`md-item md-item-claude ${selected?.path === f.path ? 'selected' : ''}`}
                onClick={() => viewFile(f)}>
                <span className="md-item-icon">C</span>
                <span className="md-item-name">{f.name}</span>
              </div>
            ))}
            {files.filter(f => f.type === 'agent-md').length === 0 && (
              <div className="md-empty">未找到 AGENT.md</div>
            )}

            <div className="md-section-title">Memory 记忆文件</div>
            {files.filter(f => f.type === 'memory').map(f => (
              <div key={f.path} className={`md-item md-item-memory ${selected?.path === f.path ? 'selected' : ''}`}
                onClick={() => viewFile(f)}>
                <span className="md-item-icon">M</span>
                <span className="md-item-name">{f.name}</span>
                <button className="md-item-del" onClick={e => { e.stopPropagation(); setDeleteConfirm(f.path); }}
                  title="删除">×</button>
              </div>
            ))}
            {files.filter(f => f.type === 'memory').length === 0 && (
              <div className="md-empty">未找到记忆文件</div>
            )}
          </div>

          <div className="md-content">
            {!selected ? (
              <div className="md-placeholder">选择一个文件查看内容</div>
            ) : (
              <>
                <div className="md-content-header">
                  <span className={`md-badge ${selected.type === 'agent-md' ? 'md-badge-claude' : 'md-badge-memory'}`}>
                    {selected.type === 'agent-md' ? 'AGENT.md · 每次自动加载' : 'Memory · 按需加载'}
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
                      <button className="settings-btn-sm" onClick={() => { setEditing(false); viewFile(selected); }}>取消</button>
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
                确定删除这个记忆文件吗？此操作不可撤销。
              </p>
            </div>
            <div className="settings-footer">
              <button className="settings-btn-sm" onClick={() => setDeleteConfirm(null)}>取消</button>
              <button className="btn btn-stop" onClick={() => handleDelete(files.find(f => f.path === deleteConfirm)!)}>删除</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
