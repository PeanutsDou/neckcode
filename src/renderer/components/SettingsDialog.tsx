import React, { useState, useEffect } from 'react';
import { useAppStore } from '../stores/app-store';

interface Props {
  open: boolean;
  onClose: () => void;
}

interface ProviderItem {
  id: string;
  name: string;
  models: string[];
}

export function SettingsDialog({ open, onClose }: Props) {
  const [activeTab, setActiveTab] = useState<'providers' | 'agent'>('providers');

  const [providerList, setProviderList] = useState<ProviderItem[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editBaseUrl, setEditBaseUrl] = useState('');
  const [editApiKey, setEditApiKey] = useState('');
  const [editModels, setEditModels] = useState('');

  const [model, setModel] = useState('deepseek-v4-pro');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [maxTurns, setMaxTurns] = useState(8);
  const [maxTokens, setMaxTokens] = useState(32768);
  const [contextLimit, setContextLimit] = useState('');
  const setContextLimitStore = useAppStore(s => s.setContextLimit);

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!open) { setSaved(false); return; }
    loadProviders();
    window.electronAPI.getConfig().then((c: any) => {
      setModel(c.model);
      setMaxTurns(c.maxTurns || 8);
      setMaxTokens(c.maxTokens || 32768);
      if (c.contextLimit) setContextLimit(String(c.contextLimit));
    }).catch(() => {});
  }, [open]);

  const loadProviders = async () => {
    try {
      const list = await window.electronAPI.getProviders();
      setProviderList(list as ProviderItem[]);
    } catch { /* */ }
  };

  const startEdit = async (id: string) => {
    const p = providerList.find(x => x.id === id);
    if (p) {
      const cfg = await window.electronAPI.getConfig() as any;
      const fullProviders = cfg.providers || [];
      const full = fullProviders.find((fp: any) => fp.id === id) || {};
      setEditingId(id);
      setEditName(p.name);
      setEditBaseUrl(full.baseUrl || '');
      setEditApiKey(full.apiKey || '');
      setEditModels(p.models.join(', '));
    }
  };

  const startNew = () => {
    setEditingId('__new__');
    setEditName('');
    setEditBaseUrl('https://api.openai.com/v1');
    setEditApiKey('');
    setEditModels('');
  };

  const cancelEdit = () => { setEditingId(null); };

  const saveProvider = async () => {
    if (!editName.trim()) return;
    const id = editingId === '__new__'
      ? editName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
      : editingId!;
    const models = editModels.split(',').map(m => m.trim()).filter(Boolean);
    if (models.length === 0) models.push('gpt-4');

    const isNew = editingId === '__new__';
    const apiKeyValue = isNew ? editApiKey.trim() : (editApiKey.trim() || undefined);
    await window.electronAPI.setProvider({
      id, name: editName.trim(),
      baseUrl: editBaseUrl.trim() || undefined,
      apiKey: apiKeyValue, models,
    } as any);
    setEditingId(null);
    loadProviders();
  };

  const deleteProvider = async (id: string) => {
    if (!window.confirm(`确定删除供应商 "${id}"？`)) return;
    await (window.electronAPI as any).deleteProvider?.(id);
    loadProviders();
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await window.electronAPI.setConfig('model', model);
      await window.electronAPI.setConfig('maxTurns', maxTurns);
      await window.electronAPI.setConfig('maxTokens', maxTokens);
      await window.electronAPI.setConfig('contextLimit', parseInt(contextLimit) || 0);
      await window.electronAPI.setConfig('systemPrompt', systemPrompt);
      const limit = parseInt(contextLimit) || 0;
      setContextLimitStore(limit > 0 ? limit : null);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error('保存失败:', err);
    }
    setSaving(false);
  };

  if (!open) return null;

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-dialog" onClick={e => e.stopPropagation()}>
        <div className="settings-header">
          <h2>设置</h2>
          <button className="settings-close" onClick={onClose}>&times;</button>
        </div>

        <div className="settings-tabs">
          <button className={`settings-tab ${activeTab === 'providers' ? 'active' : ''}`}
            onClick={() => setActiveTab('providers')}>模型供应商</button>
          <button className={`settings-tab ${activeTab === 'agent' ? 'active' : ''}`}
            onClick={() => setActiveTab('agent')}>Agent 参数</button>
        </div>

        <div className="settings-body">
          {activeTab === 'providers' && (
            <div className="settings-form">
              <div className="provider-list">
                {providerList.map(p => (
                  <div key={p.id} className="provider-item">
                    <div className="provider-info">
                      <span className="provider-name">{p.name}</span>
                      <span className="provider-models">{p.models.join(', ')}</span>
                    </div>
                    <div className="provider-actions">
                      <button className="settings-btn-sm" onClick={() => startEdit(p.id)}>编辑</button>
                      <button className="settings-btn-sm danger" onClick={() => deleteProvider(p.id)}>删除</button>
                    </div>
                  </div>
                ))}
              </div>
              <button className="btn btn-send" onClick={startNew}>＋ 添加供应商</button>

              {editingId && (
                <div className="provider-edit">
                  <h4>{editingId === '__new__' ? '新建供应商' : '编辑供应商'}</h4>
                  <label className="settings-label">
                    名称
                    <input type="text" className="settings-input" value={editName}
                      onChange={e => setEditName(e.target.value)} placeholder="例：Ollama" />
                  </label>
                  <label className="settings-label">
                    接口地址 (Base URL)
                    <input type="text" className="settings-input" value={editBaseUrl}
                      onChange={e => setEditBaseUrl(e.target.value)} />
                  </label>
                  <label className="settings-label">
                    API 密钥
                    <input type="password" className="settings-input" value={editApiKey}
                      onChange={e => setEditApiKey(e.target.value)} placeholder="sk-..." />
                  </label>
                  <label className="settings-label">
                    模型列表（逗号分隔）
                    <input type="text" className="settings-input" value={editModels}
                      onChange={e => setEditModels(e.target.value)}
                      placeholder="model-a, model-b" />
                  </label>
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <button className="btn btn-send" onClick={saveProvider}>保存</button>
                    <button className="settings-btn-sm" onClick={cancelEdit}>取消</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'agent' && (
            <div className="settings-form">
              <label className="settings-label">
                默认模型
                <input type="text" className="settings-input"
                  value={model} onChange={e => setModel(e.target.value)} />
              </label>
              <label className="settings-label">
                系统提示词 (System Prompt)
                <textarea className="settings-textarea"
                  value={systemPrompt} onChange={e => setSystemPrompt(e.target.value)}
                  rows={5} placeholder="你是一个有用的编程助手..." />
              </label>
              <label className="settings-label">
                最大对话轮数 (Max Turns)
                <input type="number" className="settings-input"
                  value={maxTurns} onChange={e => setMaxTurns(Number(e.target.value))}
                  min={1} max={50} />
              </label>
              <label className="settings-label">
                最大输出长度 (Max Output Tokens)
                <input type="number" className="settings-input"
                  value={maxTokens} onChange={e => setMaxTokens(Number(e.target.value))}
                  min={256} max={384000} step={1024} />
              </label>
              <label className="settings-label">
                上下文窗口限制 (Context Limit, 0 = 使用模型默认值)
                <input type="number" className="settings-input"
                  value={contextLimit} onChange={e => setContextLimit(e.target.value)}
                  placeholder="例如 1000000 代表 1M" min={0} step={100000} />
              </label>
            </div>
          )}
        </div>

        <div className="settings-footer">
          {saved && <span className="settings-saved">已保存</span>}
          {activeTab === 'agent' && (
            <button className="btn btn-send" onClick={handleSave} disabled={saving}>
              {saving ? '保存中...' : '保存'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
