import React, { useEffect, useState, useRef, useCallback } from 'react';
import type { AgentConfig } from '../../shared/types';

interface SkillInfo {
  name: string;
  description: string;
  userInvocable: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
}

function newAgent(): AgentConfig {
  return {
    id: `agent_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name: '',
    memory: '',
    skills: [],
    model: '',
  };
}

export function AgentDialog({ open, onClose }: Props) {
  const [agents, setAgents] = useState<AgentConfig[]>([]);
  const [selected, setSelected] = useState<AgentConfig | null>(null);
  const [editData, setEditData] = useState<AgentConfig>(newAgent());
  const [isNew, setIsNew] = useState(false);
  const [saved, setSaved] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [availableSkills, setAvailableSkills] = useState<SkillInfo[]>([]);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [size, setSize] = useState({ w: 740, h: 600 });
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const dragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0, px: 0, py: 0 });

  useEffect(() => {
    if (!open) { setSelected(null); setIsNew(false); return; }
    if (pos.x === 0 && pos.y === 0) {
      setPos({ x: Math.round(window.innerWidth / 2 - size.w / 2), y: Math.round(window.innerHeight / 2 - size.h / 2) });
    }
    loadData();
  }, [open]);

  const loadData = async () => {
    try {
      const list = await window.electronAPI?.listAgents();
      setAgents(list || []);
    } catch { /* */ }
    try {
      const skills = await window.electronAPI?.listSkills();
      setAvailableSkills(skills || []);
    } catch { /* */ }
    try {
      const cfg = await window.electronAPI?.getConfig();
      setAvailableModels(cfg?.models || []);
    } catch { /* */ }
  };

  const selectAgent = (agent: AgentConfig) => {
    setSelected(agent);
    setIsNew(false);
    setEditData({ ...agent });
    setSaved(false);
    setDeleteConfirm(null);
  };

  const startNew = () => {
    const agent = newAgent();
    // Set default model to first available
    if (availableModels.length > 0) agent.model = availableModels[0];
    setSelected(agent);
    setIsNew(true);
    setEditData({ ...agent });
    setSaved(false);
    setDeleteConfirm(null);
  };

  const handleSave = async () => {
    if (!editData.name.trim()) return;
    const agent: AgentConfig = {
      ...editData,
      name: editData.name.trim(),
    };
    try {
      console.log('[AgentDialog] saving agent:', agent);
      await window.electronAPI?.saveAgent(agent);
      console.log('[AgentDialog] save succeeded');
      setSaved(true);
      setSelected(agent);
      setIsNew(false);
      setEditData({ ...agent });
      await loadData();
      setTimeout(() => setSaved(false), 1500);
    } catch (err) {
      console.error('[AgentDialog] save failed:', err);
    }
  };

  const handleDelete = async (agentId: string) => {
    try {
      await window.electronAPI?.deleteAgent(agentId);
      if (selected?.id === agentId) { setSelected(null); setEditData(newAgent()); setIsNew(false); }
      await loadData();
      setDeleteConfirm(null);
    } catch { /* */ }
  };

  const toggleSkill = (skillName: string) => {
    setEditData(prev => {
      const has = prev.skills.includes(skillName);
      return { ...prev, skills: has ? prev.skills.filter(s => s !== skillName) : [...prev.skills, skillName] };
    });
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
          <h2>Agent 管理</h2>
          <button className="settings-close" onClick={onClose}>&times;</button>
        </div>

        <div className="md-body">
          <div className="md-list">
            <div className="md-section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>已配置 Agent</span>
              <button className="settings-btn-sm" onClick={startNew}>+ 新建</button>
            </div>
            {agents.length === 0 && (
              <div className="md-empty">
                暂无 Agent。<br />
                <span style={{ fontSize: 10 }}>点击"+ 新建"创建专属 Agent</span>
              </div>
            )}
            {agents.map(a => (
              <div key={a.id}
                className={`md-item ${selected?.id === a.id && !isNew ? 'selected' : ''}`}
                onClick={() => selectAgent(a)}>
                <span className="md-item-icon" style={{ background: '#6a8fba' }}>A</span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)' }}>{a.name || '(未命名)'}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {a.model || '未选模型'} · {a.skills.length} 个技能
                  </div>
                </div>
                <button className="md-item-del" onClick={e => { e.stopPropagation(); setDeleteConfirm(a.id); }}
                  title="删除">×</button>
              </div>
            ))}
          </div>

          <div className="md-content" style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
            {!selected ? (
              <div className="md-placeholder">选择 Agent 或新建一个</div>
            ) : (
              <>
                <div className="md-content-header">
                  <span className="md-badge" style={{ background: 'rgba(106, 143, 186, 0.1)', color: '#6a8fba' }}>
                    Agent · 由主 Agent 调度
                  </span>
                  <span className="md-content-name">{isNew ? '新建 Agent' : editData.name || '(未命名)'}</span>
                </div>

                <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, padding: '12px 0', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {/* Name */}
                  <div>
                    <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>名称</label>
                    <input
                      type="text"
                      className="settings-input"
                      value={editData.name}
                      onChange={e => setEditData({ ...editData, name: e.target.value })}
                      placeholder="例如：代码审查助手"
                      style={{ width: '100%', boxSizing: 'border-box' }}
                    />
                  </div>

                  {/* Model */}
                  <div>
                    <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>模型</label>
                    <select
                      className="settings-input"
                      value={editData.model}
                      onChange={e => setEditData({ ...editData, model: e.target.value })}
                      style={{ width: '100%', boxSizing: 'border-box' }}
                    >
                      <option value="">— 选择模型 —</option>
                      {availableModels.map(m => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  </div>

                  {/* Memory */}
                  <div>
                    <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>记忆（System Prompt）</label>
                    <textarea
                      className="md-editor"
                      value={editData.memory}
                      onChange={e => setEditData({ ...editData, memory: e.target.value })}
                      placeholder="定义 Agent 的角色、能力和行为规则..."
                      style={{ height: 100, minHeight: 80, flex: 'none', resize: 'vertical' }}
                    />
                  </div>

                  {/* Skills */}
                  <div>
                    <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
                      技能（{editData.skills.length} 个已选）
                    </label>
                    {availableSkills.length === 0 ? (
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>暂无可用技能</div>
                    ) : (
                      <div style={{ maxHeight: 140, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 0' }}>
                        {availableSkills.map(s => (
                          <label key={s.name}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 8, padding: '4px 10px',
                              fontSize: 12, cursor: 'pointer',
                              background: editData.skills.includes(s.name) ? 'var(--hover-bg)' : 'transparent',
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={editData.skills.includes(s.name)}
                              onChange={() => toggleSkill(s.name)}
                            />
                            <span style={{ color: 'var(--text-primary)' }}>{s.name}</span>
                            <span style={{ color: 'var(--text-muted)', fontSize: 10, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {s.description}
                            </span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="md-actions">
                  <button className="btn btn-send" onClick={handleSave} disabled={!editData.name.trim()}>
                    {isNew ? '创建' : '保存'}
                  </button>
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
                确定删除 Agent「{agents.find(a => a.id === deleteConfirm)?.name || '(未命名)'}」吗？此操作不可撤销。
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
