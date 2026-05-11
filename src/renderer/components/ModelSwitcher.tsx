import React, { useEffect } from 'react';
import { useAppStore } from '../stores/app-store';
import { useChatStore } from '../stores/chat-store';

export function ModelSwitcher() {
  const { currentModel, availableModels, setModel, setAvailableModels } = useAppStore();
  const activeId = useChatStore(s => s.activeId);

  useEffect(() => {
    const load = () => {
      window.electronAPI.getConfig().then(config => {
        setModel(config.model);
        setAvailableModels(config.models);
      }).catch(() => {});
    };
    load();
    const handler = () => load();
    window.addEventListener('providers-changed', handler);
    return () => window.removeEventListener('providers-changed', handler);
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newModel = e.target.value;
    setModel(newModel);
    window.electronAPI.setConfig('model', newModel).catch(console.error);
    if (activeId) window.electronAPI.setSessionModel?.(activeId, newModel);
  };

  return (
    <div className="model-switcher">
      <select value={currentModel} onChange={handleChange} className="model-select">
        {availableModels.map(m => (
          <option key={m} value={m}>{m}</option>
        ))}
      </select>
    </div>
  );
}
