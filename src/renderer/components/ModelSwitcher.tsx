import React, { useEffect } from 'react';
import { useAppStore } from '../stores/app-store';

export function ModelSwitcher() {
  const { currentModel, availableModels, setModel, setAvailableModels } = useAppStore();

  useEffect(() => {
    window.electronAPI.getConfig().then(config => {
      setModel(config.model);
      setAvailableModels(config.models);
    }).catch(() => {});
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newModel = e.target.value;
    setModel(newModel);
    window.electronAPI.setConfig('model', newModel).catch(console.error);
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
