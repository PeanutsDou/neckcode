import React, { useEffect, useMemo, useState } from 'react';

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

function formatTime(ts?: number): string {
  if (!ts) return '';
  try {
    return new Date(ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

export function TaskProgressFloat() {
  const [tasks, setTasks] = useState<AgentTask[]>([]);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    window.electronAPI?.listTasks?.()
      .then((items: any) => setTasks(Array.isArray(items) ? items : []))
      .catch(() => {});
    const unsub = window.electronAPI?.onTasksUpdated?.((items: any) => {
      setTasks(Array.isArray(items) ? items as AgentTask[] : []);
    });
    return () => unsub?.();
  }, []);

  const orderedTasks = useMemo(() => {
    return [...tasks].sort((a, b) => {
      const aDone = a.status === 'completed' ? 1 : 0;
      const bDone = b.status === 'completed' ? 1 : 0;
      if (aDone !== bDone) return aDone - bDone;
      return (b.createdAt || 0) - (a.createdAt || 0);
    });
  }, [tasks]);

  const active = orderedTasks.filter(task => task.status !== 'completed');
  const completed = orderedTasks.filter(task => task.status === 'completed');
  const total = orderedTasks.length;
  const completedCount = completed.length;
  const progress = total > 0 ? Math.round((completedCount / total) * 100) : 0;
  const visibleTasks = orderedTasks.slice(0, collapsed ? 0 : 6);

  return (
    <aside className={`task-float ${collapsed ? 'collapsed' : ''}`} aria-label="Agent 任务进度">
      <button className="task-float-header" type="button" onClick={() => setCollapsed(v => !v)}>
        <span className="task-float-title">进度</span>
        <span className="task-float-chevron">{collapsed ? '‹' : '›'}</span>
        {active.length > 0 && <span className="task-float-badge">{active.length}</span>}
      </button>

      {!collapsed && (
        <div className="task-float-body">
          <div className="task-float-progress">
            <div className="task-float-progress-text">
              <span>{total === 0 ? '暂无任务' : `${completedCount}/${total} 已完成`}</span>
              {total > 0 && <span>{progress}%</span>}
            </div>
            <div className="task-float-progress-track">
              <i style={{ width: `${progress}%` }} />
            </div>
          </div>

          {visibleTasks.length === 0 && (
            <div className="task-float-empty">Agent 创建任务后会显示在这里。</div>
          )}

          {visibleTasks.map(task => (
            <div className={`task-float-item task-float-item-${task.status}`} key={task.id}>
              <div className="task-float-item-row">
                <span className={`task-panel-status task-panel-status-${task.status}`}>{statusLabel(task.status)}</span>
                <strong>{task.subject || '未命名任务'}</strong>
              </div>
              {task.description && <div className="task-float-desc">{task.description}</div>}
              <div className="task-float-meta">
                {task.activeForm && <span>{task.activeForm}</span>}
                {task.blockedBy.length > 0 && <span>阻塞：{task.blockedBy.map(id => id.slice(0, 8)).join(', ')}</span>}
                <span>{formatTime(task.completedAt || task.createdAt)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </aside>
  );
}
