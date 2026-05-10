import React, { useState, useEffect } from 'react';

interface Props {
  open: boolean;
  onClose: () => void;
}

interface ProviderItem {
  id: string;
  name: string;
  models: string[];
}

interface ModelRow {
  name: string;
  contextLimit: number;
  maxTokens: number;
}

export function SettingsDialog({ open, onClose }: Props) {
  const [providerList, setProviderList] = useState<ProviderItem[]>([]);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editBaseUrl, setEditBaseUrl] = useState('');
  const [editApiKey, setEditApiKey] = useState('');
  const [editModels, setEditModels] = useState<ModelRow[]>([]);
  const [addingModel, setAddingModel] = useState(false);
  const [newModelName, setNewModelName] = useState('');
  const [newModelCtx, setNewModelCtx] = useState(0);
  const [newModelMax, setNewModelMax] = useState(32768);
  const [editingModelIdx, setEditingModelIdx] = useState<number | null>(null);

  useEffect(() => {
    if (!open) return;
    loadConfig();
  }, [open]);

  const loadConfig = async () => {
    try {
      const cfg = await window.electronAPI.getConfig() as any;
      const list = cfg.providers || [];
      setProviderList(list.map((p: any) => ({ id: p.id, name: p.name, models: Array.isArray(p.models) ? p.models.map((m: any) => typeof m === 'string' ? m : m.name) : [] })));
    } catch { /* */ }
  };

  const startEdit = async (id: string) => {
    const cfg = await window.electronAPI.getConfig() as any;
    const fullProviders = cfg.providers || [];
    const full = fullProviders.find((fp: any) => fp.id === id) || {};
    const models: ModelRow[] = (full.models || []).map((m: any) => ({
      name: typeof m === 'string' ? m : m.name,
      contextLimit: (typeof m === 'object' ? m.contextLimit : undefined) || 0,
      maxTokens: (typeof m === 'object' ? m.maxTokens : undefined) || 32768,
    }));
    setEditingId(id);
    setEditName(full.name || id);
    setEditBaseUrl(full.baseUrl || '');
    setEditApiKey(full.apiKey || '');
    setEditModels(models);
    setAddingModel(false);
    setEditingModelIdx(null);
  };

  const startNew = () => {
    setEditingId('__new__');
    setEditName('');
    setEditBaseUrl('https://api.openai.com/v1');
    setEditApiKey('');
    setEditModels([]);
    setAddingModel(false);
    setEditingModelIdx(null);
  };

  const cancelEdit = () => { setEditingId(null); };

  const handleAddModel = () => {
    if (!newModelName.trim()) return;
    if (editModels.some(m => m.name === newModelName.trim())) {
      setNewModelName('');
      return;
    }
    setEditModels([...editModels, {
      name: newModelName.trim(),
      contextLimit: newModelCtx || 0,
      maxTokens: newModelMax || 32768,
    }]);
    setNewModelName('');
    setNewModelCtx(0);
    setNewModelMax(32768);
    setAddingModel(false);
  };

  const handleDeleteModel = (idx: number) => {
    setEditModels(editModels.filter((_, i) => i !== idx));
    if (editingModelIdx === idx) setEditingModelIdx(null);
  };

  const handleEditModel = (idx: number) => {
    const m = editModels[idx];
    setNewModelName(m.name);
    setNewModelCtx(m.contextLimit);
    setNewModelMax(m.maxTokens);
    setEditingModelIdx(idx);
    setAddingModel(true);
  };

  const handleSaveModelEdit = () => {
    if (!newModelName.trim() || editingModelIdx === null) return;
    const updated = [...editModels];
    updated[editingModelIdx] = {
      name: newModelName.trim(),
      contextLimit: newModelCtx || 0,
      maxTokens: newModelMax || 32768,
    };
    setEditModels(updated);
    setNewModelName('');
    setNewModelCtx(0);
    setNewModelMax(32768);
    setAddingModel(false);
    setEditingModelIdx(null);
  };

  const saveProvider = async () => {
    if (!editName.trim()) return;
    const id = editingId === '__new__'
      ? (editName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') || `provider_${Date.now()}`)
      : editingId!;
    const models = editModels.map(m => ({
      name: m.name,
      contextLimit: m.contextLimit || undefined,
      maxTokens: m.maxTokens || undefined,
    }));
    const isNew = editingId === '__new__';
    const apiKeyValue = isNew ? editApiKey.trim() : (editApiKey.trim() || undefined);
    await window.electronAPI.setProvider({ id, name: editName.trim(), baseUrl: editBaseUrl.trim() || undefined, apiKey: apiKeyValue, models } as any);
    setEditingId(null);
    loadConfig();
    window.dispatchEvent(new CustomEvent('providers-changed'));
  };

  const deleteProvider = async (id: string) => {
    if (!window.confirm(`确定删除供应商 "${id}"？`)) return;
    await (window.electronAPI as any).deleteProvider?.(id);
    loadConfig();
    window.dispatchEvent(new CustomEvent('providers-changed'));
  };

  if (!open) return null;

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-dialog settings-dialog-wide" onClick={e => e.stopPropagation()} style={{ maxHeight: '85vh' }}>
        <div className="settings-header">
          <h2>设置</h2>
          <button className="settings-close" onClick={onClose}>&times;</button>
        </div>

        <div className="settings-body settings-body-row">
          {/* Left: providers list */}
          <div className="settings-left">
            <div className="settings-form">
              <div className="provider-list">
                {providerList.map(p => (
                  <div key={p.id} className={`provider-item ${editingId === p.id ? 'selected' : ''}`} onClick={() => startEdit(p.id)}>
                    <div className="provider-info">
                      <span className="provider-name">{p.name}</span>
                      <span className="provider-models">{p.models.join(', ')}</span>
                    </div>
                    <div className="provider-actions" onClick={e => e.stopPropagation()}>
                      <button className="settings-btn-sm danger" onClick={() => deleteProvider(p.id)}>×</button>
                    </div>
                  </div>
                ))}
              </div>
              <button className="btn btn-send" onClick={startNew} style={{ width: '100%', marginTop: 8 }}>＋ 添加供应商</button>
            </div>
          </div>

          {/* Right: edit form */}
          <div className="settings-right">
            {!editingId ? (
              <div className="settings-placeholder">选择一个供应商编辑，或添加新的</div>
            ) : (
              <div className="provider-edit">
                <h4>{editingId === '__new__' ? '新建供应商' : '编辑 ' + editName}</h4>
                <label className="settings-label">名称
                  <input type="text" className="settings-input" value={editName}
                    onChange={e => setEditName(e.target.value)} placeholder="例：硅基流动" />
                </label>
                <label className="settings-label">接口地址 (Base URL)
                  <input type="text" className="settings-input" value={editBaseUrl}
                    onChange={e => setEditBaseUrl(e.target.value)} placeholder="https://api.siliconflow.cn/v1" />
                </label>
                <label className="settings-label">API 密钥
                  <input type="password" className="settings-input" value={editApiKey}
                    onChange={e => setEditApiKey(e.target.value)} placeholder="sk-..." />
                </label>

                <div className="settings-label" style={{ marginTop: 8 }}>模型列表</div>
                <div className="model-list">
                  {editModels.map((m, i) => (
                    <div key={m.name + i} className="model-row">
                      <span className="model-name">{m.name}</span>
                      <span className="model-meta">
                        ctx: {m.contextLimit > 0 ? `${(m.contextLimit / 1000).toFixed(0)}K` : 'default'} · max: {m.maxTokens > 0 ? `${(m.maxTokens / 1024).toFixed(0)}K` : 'default'}
                      </span>
                      <button className="settings-btn-sm" onClick={() => handleEditModel(i)}>编辑</button>
                      <button className="settings-btn-sm danger" onClick={() => handleDeleteModel(i)}>×</button>
                    </div>
                  ))}
                  {editModels.length === 0 && !addingModel && (
                    <div className="model-row empty">尚未添加模型</div>
                  )}
                </div>

                {addingModel && (
                  <div className="model-add-row">
                    <input type="text" className="settings-input" value={newModelName}
                      onChange={e => setNewModelName(e.target.value)} placeholder="模型名" style={{ flex: 2 }} />
                    <input type="number" className="settings-input" value={newModelCtx || ''}
                      onChange={e => setNewModelCtx(Number(e.target.value))} placeholder="上下文窗口" style={{ flex: 1 }} />
                    <input type="number" className="settings-input" value={newModelMax || ''}
                      onChange={e => setNewModelMax(Number(e.target.value))} placeholder="最大输出" style={{ flex: 1 }} />
                    <button className="btn btn-send" onClick={editingModelIdx !== null ? handleSaveModelEdit : handleAddModel}>
                      {editingModelIdx !== null ? '更新' : '确认'}
                    </button>
                    <button className="settings-btn-sm" onClick={() => { setAddingModel(false); setEditingModelIdx(null); }}>取消</button>
                  </div>
                )}
                {!addingModel && (
                  <button className="settings-btn-sm" onClick={() => setAddingModel(true)} style={{ marginTop: 4 }}>＋ 添加模型</button>
                )}

                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  <button className="btn btn-send" onClick={saveProvider}>保存</button>
                  <button className="settings-btn-sm" onClick={cancelEdit}>取消</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
