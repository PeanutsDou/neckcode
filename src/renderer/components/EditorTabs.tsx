import React from 'react';
import { useEditorStore } from '../stores/editor-store';

export function EditorTabs() {
  const { tabs, activeTab, setActiveTab, closeTab } = useEditorStore();

  if (tabs.length === 0) return null;

  return (
    <div className="editor-tabs">
      {tabs.map(tab => (
        <div
          key={tab.path}
          className={`editor-tab ${tab.path === activeTab ? 'active' : ''} ${tab.isDirty ? 'dirty' : ''}`}
          onClick={() => setActiveTab(tab.path)}
        >
          <span className="tab-name">
            {tab.isDirty && <span className="tab-dirty-marker">● </span>}
            {tab.name}
          </span>
          <button
            className="tab-close"
            onClick={e => {
              e.stopPropagation();
              closeTab(tab.path);
            }}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
