import React, { useState, useEffect } from 'react';

interface Props {
  open: boolean;
  onClose: () => void;
}

export function SettingsDialog({ open, onClose }: Props) {
  const [activeTab, setActiveTab] = useState<'provider' | 'agent' | 'ui'>('provider');
  const [baseUrl, setBaseUrl] = useState('https://api.deepseek.com/v1');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('deepseek-v4-pro');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [maxTurns, setMaxTurns] = useState(8);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    window.electronAPI.getConfig().then(c => {
      setModel(c.model);
      setMaxTurns(c.maxTurns || 8);
    }).catch(() => {});
  }, [open]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await window.electronAPI.setConfig('model', model);
      await window.electronAPI.setConfig('maxTurns', maxTurns);
      await window.electronAPI.setConfig('systemPrompt', systemPrompt);
      await window.electronAPI.setProvider('deepseek', {
        id: 'deepseek',
        name: 'DeepSeek',
        type: 'openai-compatible',
        baseUrl,
        apiKey,
        model,
        models: [model],
      });
      onClose();
    } catch (err) {
      console.error('Save failed:', err);
    }
    setSaving(false);
  };

  if (!open) return null;

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-dialog" onClick={e => e.stopPropagation()}>
        <div className="settings-header">
          <h2>Settings</h2>
          <button className="settings-close" onClick={onClose}>×</button>
        </div>

        <div className="settings-tabs">
          <button className={`settings-tab ${activeTab === 'provider' ? 'active' : ''}`}
            onClick={() => setActiveTab('provider')}>Provider</button>
          <button className={`settings-tab ${activeTab === 'agent' ? 'active' : ''}`}
            onClick={() => setActiveTab('agent')}>Agent</button>
          <button className={`settings-tab ${activeTab === 'ui' ? 'active' : ''}`}
            onClick={() => setActiveTab('ui')}>UI</button>
        </div>

        <div className="settings-body">
          {activeTab === 'provider' && (
            <div className="settings-form">
              <label className="settings-label">
                API Key
                <input type="password" className="settings-input"
                  value={apiKey} onChange={e => setApiKey(e.target.value)}
                  placeholder="sk-..." />
              </label>
              <label className="settings-label">
                Base URL
                <input type="text" className="settings-input"
                  value={baseUrl} onChange={e => setBaseUrl(e.target.value)} />
              </label>
              <label className="settings-label">
                Model
                <input type="text" className="settings-input"
                  value={model} onChange={e => setModel(e.target.value)} />
              </label>
            </div>
          )}

          {activeTab === 'agent' && (
            <div className="settings-form">
              <label className="settings-label">
                System Prompt
                <textarea className="settings-textarea"
                  value={systemPrompt} onChange={e => setSystemPrompt(e.target.value)}
                  rows={6} placeholder="You are a helpful coding assistant..." />
              </label>
              <label className="settings-label">
                Max Turns
                <input type="number" className="settings-input"
                  value={maxTurns} onChange={e => setMaxTurns(Number(e.target.value))}
                  min={1} max={50} />
              </label>
            </div>
          )}

          {activeTab === 'ui' && (
            <div className="settings-form">
              <p className="settings-hint">Theme and appearance settings coming soon.</p>
            </div>
          )}
        </div>

        <div className="settings-footer">
          <button className="btn btn-send" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
