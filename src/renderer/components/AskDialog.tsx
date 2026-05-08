import React, { useEffect, useState } from 'react';

interface Question {
  question: string;
  header: string;
  options: Array<{ label: string; description: string }>;
  multiSelect?: boolean;
}

interface AskState {
  askId: string;
  questions: Question[];
}

export function AskDialog() {
  const [ask, setAsk] = useState<AskState | null>(null);
  const [answers, setAnswers] = useState<Record<string, string[]>>({});

  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.onAskShow) return;
    const unsub = api.onAskShow((askId, questions) => {
      setAsk({ askId, questions: questions as Question[] });
      setAnswers({});
    });
    return () => { unsub(); };
  }, []);

  if (!ask) return null;

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
    setAsk(null);
  };

  const handleCancel = () => {
    window.electronAPI?.respondToAsk?.(ask.askId, null);
    setAsk(null);
  };

  return (
    <div className="settings-overlay" onClick={handleCancel}>
      <div className="ask-dialog" onClick={e => e.stopPropagation()}>
        {ask.questions.map((q, qi) => (
          <div key={qi} className="ask-question">
            <div className="ask-question-header">{q.header}</div>
            <div className="ask-question-text">{q.question}</div>
            <div className="ask-options">
              {q.options.map((opt, oi) => {
                const selected = (answers[String(qi)] || []).includes(opt.label);
                return (
                  <label
                    key={oi}
                    className={`ask-option ${selected ? 'selected' : ''}`}
                    onClick={() => handleSelect(qi, opt.label, q.multiSelect || false)}
                  >
                    <span className="ask-option-label">{opt.label}</span>
                    {opt.description && (
                      <span className="ask-option-desc">{opt.description}</span>
                    )}
                  </label>
                );
              })}
            </div>
          </div>
        ))}
        <div className="settings-footer">
          <button className="btn btn-send" onClick={handleSubmit}>Submit</button>
        </div>
      </div>
    </div>
  );
}
