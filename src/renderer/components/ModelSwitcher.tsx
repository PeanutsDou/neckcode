import React, { useEffect } from 'react';
import { useAppStore } from '../stores/app-store';
import { useChatStore } from '../stores/chat-store';

export function ModelSwitcher() {
  const { currentModel, availableModels, setModel, setAvailableModels } = useAppStore();
  const activeId = useChatStore(s => s.activeId);
  const activeModelId = useChatStore(s => activeId ? s.sessions[activeId]?.modelId : null);

  useEffect(() => {
    const load = () => {
      window.electronAPI.getConfig().then(config => {
        setAvailableModels(config.models);
        if (activeModelId) setModel(activeModelId);
        else setModel(config.model);
      }).catch(() => {});
    };
    load();
    const handler = () => load();
    window.addEventListener('providers-changed', handler);
    return () => window.removeEventListener('providers-changed', handler);
  }, [activeModelId, setAvailableModels, setModel]);

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newModel = e.target.value;
    if (activeId) {
      useChatStore.getState().setSessionModelTo(activeId, newModel);
      window.electronAPI.setSessionModel?.(activeId, newModel);
    } else {
      setModel(newModel);
      window.electronAPI.setConfig('model', newModel).catch(console.error);
    }
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
