import { randomUUID } from 'crypto';
import { EventEmitter } from 'events';

export interface Task {
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

const tasks = new Map<string, Task>();
const taskEvents = new EventEmitter();

export function listTasksSnapshot(): Task[] {
  return Array.from(tasks.values()).sort((a, b) => a.createdAt - b.createdAt).map(t => ({ ...t, blocks: [...t.blocks], blockedBy: [...t.blockedBy] }));
}

export function onTasksChanged(listener: (tasks: Task[]) => void): () => void {
  taskEvents.on('changed', listener);
  return () => taskEvents.off('changed', listener);
}

function emitChanged(): void {
  taskEvents.emit('changed', listTasksSnapshot());
}

function getTask(id: string): Task | undefined {
  return tasks.get(id);
}

function taskCreate(args: Record<string, unknown>): string {
  const subject = String(args.subject || '').trim();
  if (!subject) return 'ERROR: "subject" is required.';

  const id = randomUUID();
  const task: Task = {
    id,
    subject,
    description: String(args.description || '').trim(),
    status: 'pending',
    activeForm: typeof args.activeForm === 'string' ? args.activeForm.trim() : undefined,
    blocks: [],
    blockedBy: [],
    createdAt: Date.now(),
  };
  tasks.set(id, task);
  emitChanged();
  return JSON.stringify(task, null, 2);
}

function taskGet(args: Record<string, unknown>): string {
  const id = String(args.taskId || '');
  if (!id) return 'ERROR: "taskId" is required.';
  const task = getTask(id);
  if (!task) return `Task "${id}" not found.`;
  return JSON.stringify(task, null, 2);
}

function taskList(): string {
  const list = Array.from(tasks.values())
    .sort((a, b) => a.createdAt - b.createdAt);

  if (list.length === 0) return 'No tasks.';

  return list.map(t => {
    const blocked = t.blockedBy.length > 0 ? ` [blocked by: ${t.blockedBy.join(', ')}]` : '';
    return `- ${t.id.slice(0, 8)} [${t.status}] ${t.subject}${blocked}`;
  }).join('\n');
}

function taskUpdate(args: Record<string, unknown>): string {
  const id = String(args.taskId || '');
  if (!id) return 'ERROR: "taskId" is required.';

  const task = getTask(id);
  if (!task) return `Task "${id}" not found.`;

  const changes: string[] = [];

  if (typeof args.subject === 'string' && args.subject.trim()) {
    task.subject = args.subject.trim();
    changes.push('subject');
  }
  if (typeof args.description === 'string') {
    task.description = args.description.trim();
    changes.push('description');
  }
  if (typeof args.activeForm === 'string') {
    task.activeForm = args.activeForm.trim() || undefined;
    changes.push('activeForm');
  }
  if (typeof args.status === 'string') {
    const valid: Task['status'][] = ['pending', 'in_progress', 'completed'];
    const s = args.status as Task['status'];
    if (!valid.includes(s)) {
      return `ERROR: Invalid status "${s}". Must be one of: ${valid.join(', ')}`;
    }
    // Enforce state transitions
    if (s === 'in_progress' && task.blockedBy.length > 0) {
      const stillBlocked = task.blockedBy.filter(bid => {
        const b = tasks.get(bid);
        return b && b.status !== 'completed';
      });
      if (stillBlocked.length > 0) {
        return `ERROR: Cannot start task — blocked by: ${stillBlocked.map(b => b.slice(0, 8)).join(', ')}`;
      }
    }
    task.status = s;
    if (s === 'completed') {
      task.completedAt = Date.now();
      // Unblock tasks that depend on this one
      for (const [, t] of tasks) {
        const idx = t.blockedBy.indexOf(task.id);
        if (idx !== -1) t.blockedBy.splice(idx, 1);
      }
    }
    changes.push('status');
  }
  if (Array.isArray(args.addBlocks)) {
    for (const bid of args.addBlocks as string[]) {
      if (tasks.has(bid) && !task.blocks.includes(bid)) {
        task.blocks.push(bid);
        // Reverse: this task blocks the other one
        const other = tasks.get(bid);
        if (other && !other.blockedBy.includes(task.id)) {
          other.blockedBy.push(task.id);
        }
      }
    }
    changes.push('blocks');
  }
  if (Array.isArray(args.addBlockedBy)) {
    for (const bid of args.addBlockedBy as string[]) {
      if (tasks.has(bid) && !task.blockedBy.includes(bid)) {
        task.blockedBy.push(bid);
        const blocker = tasks.get(bid);
        if (blocker && !blocker.blocks.includes(task.id)) {
          blocker.blocks.push(task.id);
        }
      }
    }
    changes.push('blockedBy');
  }

  if (changes.length === 0) return 'No changes.';
  emitChanged();

  return JSON.stringify({
    message: `Updated: ${changes.join(', ')}`,
    task: {
      id: task.id.slice(0, 8),
      subject: task.subject,
      status: task.status,
      blocks: task.blocks.map(b => b.slice(0, 8)),
      blockedBy: task.blockedBy.map(b => b.slice(0, 8)),
    },
  }, null, 2);
}

export const taskHandlers: Record<string, (args: Record<string, unknown>) => Promise<string> | string> = {
  task_create: taskCreate,
  task_get: taskGet,
  task_list: taskList,
  task_update: taskUpdate,
};
