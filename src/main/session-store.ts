import Database from 'better-sqlite3';
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { repairToolCallMessages } from './agent/session';

export interface SessionData {
  id: string;
  title?: string;
  projectPath?: string;
  modelId?: string;
  messages?: unknown[];
  agentMessages?: unknown[];
  createdAt?: number;
  updatedAt?: number;
  pinnedAt?: number | null;
}

interface SessionRow {
  id: string;
  title: string | null;
  project_path: string | null;
  model_id: string | null;
  messages_json: string | null;
  agent_messages_json: string | null;
  created_at: number | null;
  updated_at: number | null;
  pinned_at: number | null;
}

let db: Database.Database | null = null;

function dataDir(): string {
  return join(homedir(), '.deepseekcode');
}

function legacySessionsDir(): string {
  return join(dataDir(), 'sessions');
}

function parseArrayJson(value: string | null): unknown[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function rowToSession(row: SessionRow, includeMessages: boolean): SessionData {
  const session: SessionData = {
    id: row.id,
    title: row.title || undefined,
    projectPath: row.project_path || undefined,
    modelId: row.model_id || undefined,
    createdAt: row.created_at || undefined,
    updatedAt: row.updated_at || undefined,
    pinnedAt: row.pinned_at ?? null,
  };
  if (includeMessages) {
    session.messages = parseArrayJson(row.messages_json);
    session.agentMessages = repairToolCallMessages(parseArrayJson(row.agent_messages_json) as any);
  }
  return session;
}

export function getDb(): Database.Database {
  if (db) return db;

  mkdirSync(dataDir(), { recursive: true });
  db = new Database(join(dataDir(), 'deepseekcode.db'));
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      title TEXT,
      project_path TEXT,
      model_id TEXT,
      messages_json TEXT NOT NULL DEFAULT '[]',
      agent_messages_json TEXT NOT NULL DEFAULT '[]',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      pinned_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_updated_at ON sessions(updated_at DESC);
  `);

  const columns = db.prepare('PRAGMA table_info(sessions)').all() as Array<{ name: string }>;
  if (!columns.some(col => col.name === 'pinned_at')) {
    db.exec('ALTER TABLE sessions ADD COLUMN pinned_at INTEGER');
  }
  db.exec('CREATE INDEX IF NOT EXISTS idx_sessions_pinned_created_at ON sessions(pinned_at DESC, created_at ASC)');

  migrateLegacyJsonSessions(db);
  return db;
}

function migrateLegacyJsonSessions(database: Database.Database): void {
  const dir = legacySessionsDir();
  if (!existsSync(dir)) return;

  const insert = database.prepare(`
    INSERT OR IGNORE INTO sessions (
      id, title, project_path, model_id, messages_json, agent_messages_json, created_at, updated_at
    ) VALUES (
      @id, @title, @projectPath, @modelId, @messagesJson, @agentMessagesJson, @createdAt, @updatedAt
    )
  `);

  const migrate = database.transaction(() => {
    for (const name of readdirSync(dir)) {
      if (!name.endsWith('.json')) continue;
      try {
        const raw = readFileSync(join(dir, name), 'utf8');
        const session = JSON.parse(raw) as SessionData;
        if (!session.id) continue;
        const now = Date.now();
        insert.run({
          id: session.id,
          title: session.title ?? null,
          projectPath: session.projectPath ?? null,
          modelId: session.modelId ?? null,
          messagesJson: JSON.stringify(session.messages || []),
          agentMessagesJson: JSON.stringify(session.agentMessages || []),
          createdAt: session.createdAt || session.updatedAt || now,
          updatedAt: session.updatedAt || now,
        });
      } catch {
        // Ignore corrupt legacy session files; they should not block app startup.
      }
    }
  });

  migrate();
}

export function saveSession(session: SessionData): void {
  const database = getDb();
  const existing = loadSession(session.id);
  const now = Date.now();
  const merged: SessionData = {
    id: session.id,
    title: session.title ?? existing?.title,
    projectPath: session.projectPath ?? existing?.projectPath,
    modelId: session.modelId ?? existing?.modelId,
    messages: session.messages ?? existing?.messages ?? [],
    agentMessages: repairToolCallMessages((session.agentMessages ?? existing?.agentMessages ?? []) as any),
    createdAt: session.createdAt || existing?.createdAt || now,
    updatedAt: session.updatedAt || now,
    pinnedAt: session.pinnedAt !== undefined ? session.pinnedAt : existing?.pinnedAt ?? null,
  };

  database.prepare(`
    INSERT INTO sessions (
      id, title, project_path, model_id, messages_json, agent_messages_json, created_at, updated_at, pinned_at
    ) VALUES (
      @id, @title, @projectPath, @modelId, @messagesJson, @agentMessagesJson, @createdAt, @updatedAt, @pinnedAt
    )
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      project_path = excluded.project_path,
      model_id = excluded.model_id,
      messages_json = excluded.messages_json,
      agent_messages_json = excluded.agent_messages_json,
      created_at = excluded.created_at,
      updated_at = excluded.updated_at,
      pinned_at = excluded.pinned_at
  `).run({
    id: merged.id,
    title: merged.title ?? null,
    projectPath: merged.projectPath ?? null,
    modelId: merged.modelId ?? null,
    messagesJson: JSON.stringify(merged.messages || []),
    agentMessagesJson: JSON.stringify(merged.agentMessages || []),
    createdAt: merged.createdAt,
    updatedAt: merged.updatedAt,
    pinnedAt: merged.pinnedAt ?? null,
  });
}

export function loadSession(id: string): SessionData | null {
  const row = getDb().prepare('SELECT * FROM sessions WHERE id = ?').get(id) as SessionRow | undefined;
  return row ? rowToSession(row, true) : null;
}

export function listSessions(): SessionData[] {
  const rows = getDb()
    .prepare(`
      SELECT id, title, project_path, model_id, NULL AS messages_json, NULL AS agent_messages_json, created_at, updated_at, pinned_at
      FROM sessions
      ORDER BY
        CASE WHEN pinned_at IS NULL THEN 1 ELSE 0 END,
        pinned_at DESC,
        created_at ASC,
        id ASC
    `)
    .all() as SessionRow[];
  return rows.map(row => rowToSession(row, false));
}

export function deleteSession(id: string): void {
  getDb().prepare('DELETE FROM sessions WHERE id = ?').run(id);
}

export function renameSession(id: string, title: string): boolean {
  const result = getDb()
    .prepare('UPDATE sessions SET title = ?, updated_at = ? WHERE id = ?')
    .run(title, Date.now(), id);
  return result.changes > 0;
}

export function setSessionPinned(id: string, pinned: boolean): boolean {
  const result = getDb()
    .prepare('UPDATE sessions SET pinned_at = ? WHERE id = ?')
    .run(pinned ? Date.now() : null, id);
  return result.changes > 0;
}
