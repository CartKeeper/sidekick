import Database from 'better-sqlite3';
import { nanoid } from 'nanoid';

const instances = new Map<string, Database.Database>();

export function getDb(dbPath?: string): Database.Database {
  const resolvedPath = dbPath ?? './data/sidekick.db';

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

  instances.set(resolvedPath, db);
  return db;
}

export function closeDb(dbPath?: string): void {
  const resolvedPath = dbPath ?? './data/sidekick.db';
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
