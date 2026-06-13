import Database from 'better-sqlite3';
import { nanoid } from 'nanoid';
import path from 'path';
import fs from 'fs';
import os from 'os';

// Single canonical location for all contexts (dev, packaged app, MCP server).
// Keeping this in one place prevents divergence between the dev DB and the
// packaged-app DB, which previously caused data loss on rebuild.
const DEFAULT_DB_PATH = path.join(os.homedir(), 'Library', 'Application Support', 'Sidekick', 'sidekick.db');

fs.mkdirSync(path.dirname(DEFAULT_DB_PATH), { recursive: true });

const instances = new Map<string, Database.Database>();

export function getDb(dbPath?: string): Database.Database {
  const resolvedPath = dbPath ?? DEFAULT_DB_PATH;

  const existing = instances.get(resolvedPath);
  if (existing) return existing;

  const db = new Database(resolvedPath);

  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS vault_config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      description TEXT DEFAULT '',
      icon TEXT DEFAULT '',
      color TEXT DEFAULT '#6366f1',
      path TEXT DEFAULT '',
      start_commands TEXT DEFAULT '[]',
      dev_url TEXT DEFAULT '',
      default_environment TEXT DEFAULT 'dev',
      enable_terminal INTEGER DEFAULT 1,
      enable_vscode INTEGER DEFAULT 1,
      enable_browser INTEGER DEFAULT 0,
      stack TEXT DEFAULT '[]',
      sort_order INTEGER DEFAULT 0,
      archived INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS environments (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      slug TEXT NOT NULL,
      sort_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(project_id, slug)
    );

    CREATE TABLE IF NOT EXISTS secrets (
      id TEXT PRIMARY KEY,
      environment_id TEXT NOT NULL REFERENCES environments(id) ON DELETE CASCADE,
      key TEXT NOT NULL,
      value_encrypted TEXT NOT NULL,
      iv TEXT NOT NULL,
      auth_tag TEXT NOT NULL,
      type TEXT DEFAULT 'generic',
      notes TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(environment_id, key)
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id TEXT PRIMARY KEY,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      entity_name TEXT DEFAULT '',
      details TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_environments_project ON environments(project_id);
    CREATE INDEX IF NOT EXISTS idx_secrets_env ON secrets(environment_id);
    CREATE INDEX IF NOT EXISTS idx_secrets_key ON secrets(key);
    CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at DESC);
  `);

  // Migrations — add columns that may not exist yet
  const cols = db.prepare("PRAGMA table_info(projects)").all() as { name: string }[];
  const colNames = new Set(cols.map((c) => c.name));
  if (!colNames.has('icon_path')) {
    db.exec("ALTER TABLE projects ADD COLUMN icon_path TEXT DEFAULT ''");
  }
  if (!colNames.has('supabase_project_ref')) {
    db.exec("ALTER TABLE projects ADD COLUMN supabase_project_ref TEXT DEFAULT ''");
  }
  if (!colNames.has('supabase_last_sync')) {
    db.exec("ALTER TABLE projects ADD COLUMN supabase_last_sync TEXT DEFAULT NULL");
  }
  if (!colNames.has('supabase_token_encrypted')) {
    db.exec("ALTER TABLE projects ADD COLUMN supabase_token_encrypted TEXT DEFAULT NULL");
    db.exec("ALTER TABLE projects ADD COLUMN supabase_token_iv TEXT DEFAULT NULL");
    db.exec("ALTER TABLE projects ADD COLUMN supabase_token_auth_tag TEXT DEFAULT NULL");
  }
  if (!colNames.has('include_in_toolbar')) {
    db.exec("ALTER TABLE projects ADD COLUMN include_in_toolbar INTEGER DEFAULT 1");
  }

  // Secrets source column
  const secretCols = db.prepare("PRAGMA table_info(secrets)").all() as { name: string }[];
  const secretColNames = new Set(secretCols.map((c) => c.name));
  if (!secretColNames.has('source')) {
    db.exec("ALTER TABLE secrets ADD COLUMN source TEXT DEFAULT 'manual'");
  }

  instances.set(resolvedPath, db);
  return db;
}

export function closeDb(dbPath?: string): void {
  const resolvedPath = dbPath ?? DEFAULT_DB_PATH;
  const db = instances.get(resolvedPath);
  if (db) {
    db.close();
    instances.delete(resolvedPath);
  }
}

export function newId(): string {
  return nanoid(21);
}

export function getConfig(db: Database.Database, key: string): string | null {
  const row = db.prepare('SELECT value FROM vault_config WHERE key = ?').get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}

export function setConfig(db: Database.Database, key: string, value: string): void {
  db.prepare(
    'INSERT INTO vault_config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  ).run(key, value);
}

export function logAudit(
  db: Database.Database,
  action: string,
  entityType: string,
  entityId: string,
  entityName: string,
  details: Record<string, unknown> = {}
): void {
  db.prepare(
    'INSERT INTO audit_log (id, action, entity_type, entity_id, entity_name, details) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(newId(), action, entityType, entityId, entityName, JSON.stringify(details));
}
