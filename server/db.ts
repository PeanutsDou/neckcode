import Database from 'better-sqlite3';
import { mkdirSync } from 'fs';
import { dirname } from 'path';
import { config } from './config';
import { logger } from './logger';

let db: Database.Database;

export function getDb(): Database.Database {
  if (!db) throw new Error('Database not initialized');
  return db;
}

export function initDb(): void {
  // 确保数据目录存在
  const dir = dirname(config.dbPath);
  mkdirSync(dir, { recursive: true });

  db = new Database(config.dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  runMigrations();
  logger.info('Database initialized', { path: config.dbPath });
}

function runMigrations(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      display_name TEXT NOT NULL,
      avatar TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
      last_seen_at INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

    CREATE TABLE IF NOT EXISTS friends (
      user_id TEXT NOT NULL,
      friend_id TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
      PRIMARY KEY (user_id, friend_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (friend_id) REFERENCES users(id) ON DELETE CASCADE,
      CHECK (user_id <> friend_id),
      CHECK (status IN ('pending_sent', 'pending_received', 'accepted', 'blocked'))
    );

    CREATE INDEX IF NOT EXISTS idx_friends_friend_id ON friends(friend_id);
    CREATE INDEX IF NOT EXISTS idx_friends_user_status ON friends(user_id, status);

    CREATE TABLE IF NOT EXISTS direct_messages (
      id TEXT PRIMARY KEY,
      from_user TEXT NOT NULL,
      to_user TEXT NOT NULL,
      content TEXT NOT NULL,
      msg_type TEXT NOT NULL DEFAULT 'text',
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      delivered_at INTEGER,
      read_at INTEGER,
      FOREIGN KEY (from_user) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (to_user) REFERENCES users(id) ON DELETE CASCADE,
      CHECK (from_user <> to_user),
      CHECK (msg_type IN ('text', 'system'))
    );

    CREATE INDEX IF NOT EXISTS idx_dm_from_to_created ON direct_messages(from_user, to_user, created_at);
    CREATE INDEX IF NOT EXISTS idx_dm_to_from_created ON direct_messages(to_user, from_user, created_at);
    CREATE INDEX IF NOT EXISTS idx_dm_to_delivered ON direct_messages(to_user, delivered_at);
  `);
}

export function closeDb(): void {
  if (db) {
    db.close();
    logger.info('Database closed');
  }
}
