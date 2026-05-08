import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useAppStore } from '../stores/app-store';

export function ModelCompare() {
  const { compareMode, compareModels, toggleCompareMode, availableModels, setCompareModels } = useAppStore();
  const [results, setResults] = useState<{ model: string; text: string; error?: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [prompt, setPrompt] = useState('');

  const handleCompare = async () => {
    if (!prompt.trim() || loading) return;
    setLoading(true);
    setResults([]);
    try {
      const res = await window.electronAPI.compare(prompt, compareModels);
      setResults(res as { model: string; text: string; error?: string }[]);
    } catch (err) {
      console.error('Compare failed:', err);
    }
    setLoading(false);
  };

  if (!compareMode) {
    return (
      <button className={`toolbar-btn ${compareMode ? 'active' : ''}`} onClick={toggleCompareMode}>
        对比
      </button>
    );
  }

  return (
    <div className="compare-overlay">
        <div className="compare-dialog">
          <div className="compare-header">
            <h3>Model Compare</h3>
            <div className="compare-model-selects">
              {compareModels.map((m, i) => (
                <select key={i} value={m} className="model-select"
                  onChange={e => {
                    const updated = [...compareModels];
                    updated[i] = e.target.value;
                    setCompareModels(updated);
                  }}>
                  {availableModels.map(am => <option key={am} value={am}>{am}</option>)}
                </select>
              ))}
            </div>
          </div>

          <div className="compare-input-row">
            <textarea className="chat-input" value={prompt} onChange={e => setPrompt(e.target.value)}
              placeholder="Enter prompt to compare..." rows={2}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleCompare(); } }} />
            <button className="btn btn-send" onClick={handleCompare} disabled={loading || !prompt.trim()}>
              {loading ? '...' : 'Compare'}
            </button>
          </div>

          {results.length > 0 && (
            <div className="compare-results">
              {results.map((r, i) => (
                <div key={i} className="compare-column">
                  <div className="compare-model-name">{r.model}</div>
                  <div className="compare-model-result">
                    {r.error ? (
                      <span className="error">{r.error}</span>
                    ) : (
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{r.text}</ReactMarkdown>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
  );
}
