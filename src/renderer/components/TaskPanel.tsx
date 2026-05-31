import React, { useEffect, useState } from 'react';

interface AgentTask {
  id: string;
  subject: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed';
  activeForm?: string;
  blocks: string[];
  blockedBy: string[];
  createdAt: number;
  completedAt?: number;
}

function statusLabel(status: AgentTask['status']): string {
  if (status === 'in_progress') return '进行中';
  if (status === 'completed') return '完成';
  return '待办';
}

export function TaskPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [tasks, setTasks] = useState<AgentTask[]>([]);

  useEffect(() => {
    if (!open) return;
    window.electronAPI?.listTasks?.().then((items: any) => setTasks(Array.isArray(items) ? items : [])).catch(() => {});
    const unsub = window.electronAPI?.onTasksUpdated?.((items: any) => {
      setTasks(Array.isArray(items) ? items as AgentTask[] : []);
    });
    return () => unsub?.();
  }, [open]);

  if (!open) return null;

  const active = tasks.filter(task => task.status !== 'completed');
  const completed = tasks.filter(task => task.status === 'completed');

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-dialog task-panel-dialog" onClick={e => e.stopPropagation()}>
        <div className="settings-header">
          <h2>任务面板</h2>
          <button className="settings-close" onClick={onClose}>&times;</button>
        </div>
        <div className="settings-body task-panel-body">
          {tasks.length === 0 && <div className="md-empty">当前没有 Agent 任务。</div>}
          {active.length > 0 && <div className="md-section-title">当前任务</div>}
          {active.map(task => (
            <div className="task-panel-item" key={task.id}>
              <div className="task-panel-row">
                <span className={`task-panel-status task-panel-status-${task.status}`}>{statusLabel(task.status)}</span>
                <strong>{task.subject}</strong>
              </div>
              {task.description && <div className="task-panel-desc">{task.description}</div>}
              {task.blockedBy.length > 0 && <div className="task-panel-meta">阻塞于：{task.blockedBy.map(id => id.slice(0, 8)).join(', ')}</div>}
            </div>
          ))}
          {completed.length > 0 && <div className="md-section-title">已完成</div>}
          {completed.map(task => (
            <div className="task-panel-item completed" key={task.id}>
              <div className="task-panel-row">
                <span className={`task-panel-status task-panel-status-${task.status}`}>{statusLabel(task.status)}</span>
                <strong>{task.subject}</strong>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
