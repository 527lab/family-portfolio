import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { config } from './config.ts';

let db: DatabaseSync | undefined;
let dbPath: string | undefined;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','creator')),
  status TEXT NOT NULL CHECK (status IN ('active','pending','disabled')),
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS invites (
  code_hash TEXT PRIMARY KEY,
  created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  used_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS works (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('painting','photography','piano','certificate')),
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  date TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft','published')) DEFAULT 'draft',
  featured INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL,
  alt TEXT NOT NULL DEFAULT '',
  medium TEXT NOT NULL DEFAULT '',
  size TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL DEFAULT '',
  camera TEXT NOT NULL DEFAULT '',
  composer TEXT NOT NULL DEFAULT '',
  event TEXT NOT NULL DEFAULT '',
  result TEXT NOT NULL DEFAULT '',
  image_file TEXT,
  thumb_file TEXT,
  video_file TEXT,
  youtube_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_works_public ON works (status, category, sort_order);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions (user_id);
`;

export function getDb(): DatabaseSync {
  const path = join(config().dataDir, 'app.db');
  if (db && dbPath === path) return db;
  closeDb();
  mkdirSync(config().dataDir, { recursive: true });
  db = new DatabaseSync(path);
  dbPath = path;
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  db.exec(SCHEMA);
  return db;
}

export function closeDb() {
  db?.close();
  db = undefined;
  dbPath = undefined;
}

// 交易包裝：失敗自動 rollback
export function transaction<T>(fn: () => T): T {
  const d = getDb();
  d.exec('BEGIN IMMEDIATE');
  try {
    const r = fn();
    d.exec('COMMIT');
    return r;
  } catch (e) {
    d.exec('ROLLBACK');
    throw e;
  }
}
