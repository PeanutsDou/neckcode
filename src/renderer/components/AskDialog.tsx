import React, { useEffect, useState } from 'react';
import type { ConfirmRequest, RiskLevel } from '../../shared/types';

interface Question {
  question: string;
  header: string;
  options: Array<{ label: string; description: string }>;
  multiSelect?: boolean;
}

interface AskState {
  sessionId: string;
  askId: string;
  questions: Question[];
}

interface ConfirmState {
  sessionId: string;
  confirmId: string;
  request: string | ConfirmRequest;
}

function normalizeConfirm(request: string | ConfirmRequest): ConfirmRequest {
  if (typeof request !== 'string') return request;
  return { toolName: 'unknown', riskLevel: 'medium', summary: request, rawArgs: {} };
}

const riskLabels: Record<RiskLevel, string> = {
  low: '低风险',
  medium: '中风险',
  high: '高风险',
};

export function AskDialog() {
  const [askQueue, setAskQueue] = useState<AskState[]>([]);
  const [confirmQueue, setConfirmQueue] = useState<ConfirmState[]>([]);
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const ask = askQueue[0] || null;
  const confirm = !ask ? confirmQueue[0] || null : null;

  useEffect(() => {
    const api = window.electronAPI;
    const unsubAsk = api?.onAskShow?.((sessionId, askId, questions) => {
      setAskQueue(prev => [...prev, { sessionId, askId, questions: questions as Question[] }]);
    });
    const unsubConfirm = api?.onConfirmShow?.((sessionId, confirmId, request) => {
      setConfirmQueue(prev => [...prev, { sessionId, confirmId, request }]);
    });
    return () => {
      unsubAsk?.();
      unsubConfirm?.();
    };
  }, []);

  useEffect(() => {
    setAnswers({});
  }, [ask?.askId]);

  if (!ask && !confirm) return null;

  const handleSelect = (questionIdx: number, optionLabel: string, multi: boolean) => {
    setAnswers(prev => {
      const key = String(questionIdx);
      const current = prev[key] || [];
      if (multi) {
        const next = current.includes(optionLabel)
          ? current.filter(l => l !== optionLabel)
          : [...current, optionLabel];
        return { ...prev, [key]: next };
      }
      return { ...prev, [key]: [optionLabel] };
    });
  };

  const handleSubmit = () => {
    const flat: Record<string, string> = {};
    for (const [key, vals] of Object.entries(answers)) {
      flat[key] = vals.join(', ');
    }
    // Fill unanswered with first option
    ask.questions.forEach((q, i) => {
      if (!flat[String(i)]) {
        flat[String(i)] = q.options[0]?.label || '';
      }
    });
    window.electronAPI?.respondToAsk?.(ask.askId, flat);
    setAskQueue(prev => prev.slice(1));
  };

  const handleCancel = () => {
    if (ask) {
      window.electronAPI?.respondToAsk?.(ask.askId, null);
      setAskQueue(prev => prev.slice(1));
      return;
    }
    if (confirm) {
      window.electronAPI?.respondToConfirm?.(confirm.confirmId, false);
      setConfirmQueue(prev => prev.slice(1));
    }
  };

  const handleConfirm = () => {
    if (!confirm) return;
    window.electronAPI?.respondToConfirm?.(confirm.confirmId, true);
    setConfirmQueue(prev => prev.slice(1));
  };

  return (
    <div className="settings-overlay" onClick={handleCancel}>
      {ask && (
        <div className="ask-dialog" onClick={e => e.stopPropagation()}>
          {ask.questions.map((q, qi) => (
            <div key={qi} className="ask-question">
              <div className="ask-question-header">{q.header || '需要选择'} · {ask.sessionId.slice(0, 8)}</div>
              <div className="ask-question-text">{q.question}</div>
              <div className="ask-options">
                {q.options.map((opt, oi) => {
                  const selected = (answers[String(qi)] || []).includes(opt.label);
                  return (
                    <button
                      key={oi}
                      type="button"
                      className={`ask-option ${selected ? 'selected' : ''}`}
                      onClick={() => handleSelect(qi, opt.label, q.multiSelect || false)}
                    >
                      <span className="ask-option-label">{opt.label}</span>
                      {opt.description && (
                        <span className="ask-option-desc">{opt.description}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          <div className="settings-footer">
            <button className="btn" onClick={handleCancel}>取消</button>
            <button className="btn btn-send" onClick={handleSubmit}>确认</button>
          </div>
        </div>
      )}
      {confirm && (
        <div className="ask-dialog confirm-dialog" onClick={e => e.stopPropagation()}>
          {(() => {
            const req = normalizeConfirm(confirm.request);
            return (
              <div className="ask-question">
                <div className="ask-question-header">
                  需要确认 · {confirm.sessionId.slice(0, 8)}
                  <span className={`risk-badge risk-${req.riskLevel}`}>{riskLabels[req.riskLevel]}</span>
                </div>
                <div className="ask-question-text">{req.summary}</div>
                <div className="confirm-details">
                  <div><strong>工具</strong><span>{req.toolName}</span></div>
                  {req.cwd && <div><strong>目录</strong><span>{req.cwd}</span></div>}
                  {req.command && <div><strong>命令</strong><code>{req.command}</code></div>}
                  {req.paths && req.paths.length > 0 && <div><strong>路径</strong><span>{req.paths.join(', ')}</span></div>}
                </div>
                {req.warnings && req.warnings.length > 0 && (
                  <div className="confirm-warnings">
                    {req.warnings.map(w => <div key={w}>{w}</div>)}
                  </div>
                )}
                {req.rawArgs && <pre className="confirm-message">{JSON.stringify(req.rawArgs, null, 2)}</pre>}
              </div>
            );
          })()}
          <div className="settings-footer">
            <button className="btn" onClick={handleCancel}>取消</button>
            <button className="btn btn-send" onClick={handleConfirm}>允许</button>
          </div>
        </div>
      )}
    </div>
  );
}
