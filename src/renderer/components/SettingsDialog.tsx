import React, { useState, useEffect } from 'react';
import { useAppStore } from '../stores/app-store';

interface Props {
  open: boolean;
  onClose: () => void;
}

export function SettingsDialog({ open, onClose }: Props) {
  const [activeTab, setActiveTab] = useState<'deepseek' | 'anthropic' | 'agent'>('deepseek');

  // DeepSeek
  const [dsApiKey, setDsApiKey] = useState('');
  const [dsBaseUrl, setDsBaseUrl] = useState('https://api.deepseek.com/v1');

  // Anthropic
  const [antApiKey, setAntApiKey] = useState('');

  // Agent
  const [model, setModel] = useState('deepseek-v4-pro');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [maxTurns, setMaxTurns] = useState(8);
  const [contextLimit, setContextLimit] = useState('');

  const setContextLimitStore = useAppStore(s => s.setContextLimit);

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!open) { setSaved(false); return; }

    window.electronAPI.getConfig().then(c => {
      setModel(c.model);
      setMaxTurns(c.maxTurns || 8);
      setDsBaseUrl(c.baseUrl || 'https://api.deepseek.com/v1');
    }).catch(() => {});
  }, [open]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await window.electronAPI.setConfig('deepseekApiKey', dsApiKey);
      await window.electronAPI.setConfig('baseUrl', dsBaseUrl);
      await window.electronAPI.setConfig('anthropicApiKey', antApiKey);
      await window.electronAPI.setConfig('model', model);
      await window.electronAPI.setConfig('maxTurns', maxTurns);
      await window.electronAPI.setConfig('systemPrompt', systemPrompt);
      const limit = parseInt(contextLimit) || 0;
      setContextLimitStore(limit > 0 ? limit : null);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
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
          <button className="settings-close" onClick={onClose}>&times;</button>
        </div>

        <div className="settings-tabs">
          <button className={`settings-tab ${activeTab === 'deepseek' ? 'active' : ''}`}
            onClick={() => setActiveTab('deepseek')}>DeepSeek</button>
          <button className={`settings-tab ${activeTab === 'anthropic' ? 'active' : ''}`}
            onClick={() => setActiveTab('anthropic')}>Anthropic</button>
          <button className={`settings-tab ${activeTab === 'agent' ? 'active' : ''}`}
            onClick={() => setActiveTab('agent')}>Agent</button>
        </div>

        <div className="settings-body">
          {activeTab === 'deepseek' && (
            <div className="settings-form">
              <label className="settings-label">
                API Key
                <input type="password" className="settings-input"
                  value={dsApiKey} onChange={e => setDsApiKey(e.target.value)}
                  placeholder="sk-..." />
              </label>
              <label className="settings-label">
                Base URL
                <input type="text" className="settings-input"
                  value={dsBaseUrl} onChange={e => setDsBaseUrl(e.target.value)} />
              </label>
            </div>
          )}

          {activeTab === 'anthropic' && (
            <div className="settings-form">
              <label className="settings-label">
                API Key
                <input type="password" className="settings-input"
                  value={antApiKey} onChange={e => setAntApiKey(e.target.value)}
                  placeholder="sk-ant-..." />
              </label>
            </div>
          )}

          {activeTab === 'agent' && (
            <div className="settings-form">
              <label className="settings-label">
                Default Model
                <input type="text" className="settings-input"
                  value={model} onChange={e => setModel(e.target.value)} />
              </label>
              <label className="settings-label">
                System Prompt
                <textarea className="settings-textarea"
                  value={systemPrompt} onChange={e => setSystemPrompt(e.target.value)}
                  rows={5} placeholder="You are a helpful coding assistant..." />
              </label>
              <label className="settings-label">
                Max Turns
                <input type="number" className="settings-input"
                  value={maxTurns} onChange={e => setMaxTurns(Number(e.target.value))}
                  min={1} max={50} />
              </label>
              <label className="settings-label">
                Context Limit (tokens, 0 = model default)
                <input type="number" className="settings-input"
                  value={contextLimit} onChange={e => setContextLimit(e.target.value)}
                  placeholder="e.g. 1000000 for 1M" min={0} step={100000} />
              </label>
            </div>
          )}
        </div>

        <div className="settings-footer">
          {saved && <span className="settings-saved">Saved!</span>}
          <button className="btn btn-send" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
