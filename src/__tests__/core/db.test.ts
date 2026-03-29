import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { getDb, closeDb, newId, getConfig, setConfig, logAudit } from '../../core/db.js';

let tmpDir: string;
let dbPath: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'sidekick-test-'));
  dbPath = join(tmpDir, 'test.db');
});

afterEach(() => {
  closeDb(dbPath);
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('getDb', () => {
  it('creates a database with all tables', () => {
    const db = getDb(dbPath);
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as { name: string }[];
    const names = tables.map((t) => t.name);
    expect(names).toContain('vault_config');
    expect(names).toContain('projects');
    expect(names).toContain('environments');
    expect(names).toContain('secrets');
    expect(names).toContain('audit_log');
  });

  it('returns the same instance on repeated calls', () => {
    const db1 = getDb(dbPath);
    const db2 = getDb(dbPath);
    expect(db1).toBe(db2);
  });

  it('sets WAL journal mode', () => {
    const db = getDb(dbPath);
    const result = db.prepare('PRAGMA journal_mode').get() as { journal_mode: string };
    expect(result.journal_mode).toBe('wal');
  });

  it('enables foreign keys', () => {
    const db = getDb(dbPath);
    const result = db.prepare('PRAGMA foreign_keys').get() as { foreign_keys: number };
    expect(result.foreign_keys).toBe(1);
  });
});

describe('projects table', () => {
  it('has all required columns including launch config fields', () => {
    const db = getDb(dbPath);
    const cols = db.prepare('PRAGMA table_info(projects)').all() as { name: string }[];
    const colNames = cols.map((c) => c.name);
    expect(colNames).toContain('id');
    expect(colNames).toContain('name');
    expect(colNames).toContain('description');
    expect(colNames).toContain('icon');
    expect(colNames).toContain('color');
    expect(colNames).toContain('path');
    expect(colNames).toContain('start_commands');
    expect(colNames).toContain('dev_url');
    expect(colNames).toContain('default_environment');
    expect(colNames).toContain('enable_terminal');
    expect(colNames).toContain('enable_vscode');
    expect(colNames).toContain('enable_browser');
    expect(colNames).toContain('stack');
    expect(colNames).toContain('sort_order');
    expect(colNames).toContain('archived');
  });

  it('enforces unique project names', () => {
    const db = getDb(dbPath);
    const id1 = newId();
    const id2 = newId();
    db.prepare('INSERT INTO projects (id, name) VALUES (?, ?)').run(id1, 'MyApp');
    expect(() =>
      db.prepare('INSERT INTO projects (id, name) VALUES (?, ?)').run(id2, 'MyApp')
    ).toThrow(/UNIQUE/);
  });
});

describe('environments table', () => {
  it('enforces unique slug per project', () => {
    const db = getDb(dbPath);
    const projId = newId();
    db.prepare('INSERT INTO projects (id, name) VALUES (?, ?)').run(projId, 'Test');
    const env1 = newId();
    const env2 = newId();
    db.prepare(
      'INSERT INTO environments (id, project_id, name, slug) VALUES (?, ?, ?, ?)'
    ).run(env1, projId, 'Dev', 'dev');
    expect(() =>
      db
        .prepare('INSERT INTO environments (id, project_id, name, slug) VALUES (?, ?, ?, ?)')
        .run(env2, projId, 'Development', 'dev')
    ).toThrow(/UNIQUE/);
  });

  it('cascades delete when project is removed', () => {
    const db = getDb(dbPath);
    const projId = newId();
    const envId = newId();
    db.prepare('INSERT INTO projects (id, name) VALUES (?, ?)').run(projId, 'Test');
    db.prepare(
      'INSERT INTO environments (id, project_id, name, slug) VALUES (?, ?, ?, ?)'
    ).run(envId, projId, 'Dev', 'dev');
    db.prepare('DELETE FROM projects WHERE id = ?').run(projId);
    const envs = db.prepare('SELECT * FROM environments WHERE project_id = ?').all(projId);
    expect(envs).toHaveLength(0);
  });
});

describe('secrets table', () => {
  it('enforces unique key per environment', () => {
    const db = getDb(dbPath);
    const projId = newId();
    const envId = newId();
    db.prepare('INSERT INTO projects (id, name) VALUES (?, ?)').run(projId, 'P');
    db.prepare(
      'INSERT INTO environments (id, project_id, name, slug) VALUES (?, ?, ?, ?)'
    ).run(envId, projId, 'Dev', 'dev');
    db.prepare(
      'INSERT INTO secrets (id, environment_id, key, value_encrypted, iv, auth_tag) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(newId(), envId, 'API_KEY', 'enc', 'iv1', 'tag1');
    expect(() =>
      db
        .prepare(
          'INSERT INTO secrets (id, environment_id, key, value_encrypted, iv, auth_tag) VALUES (?, ?, ?, ?, ?, ?)'
        )
        .run(newId(), envId, 'API_KEY', 'enc2', 'iv2', 'tag2')
    ).toThrow(/UNIQUE/);
  });

  it('cascades delete when environment is removed', () => {
    const db = getDb(dbPath);
    const projId = newId();
    const envId = newId();
    db.prepare('INSERT INTO projects (id, name) VALUES (?, ?)').run(projId, 'P');
    db.prepare(
      'INSERT INTO environments (id, project_id, name, slug) VALUES (?, ?, ?, ?)'
    ).run(envId, projId, 'Dev', 'dev');
    db.prepare(
      'INSERT INTO secrets (id, environment_id, key, value_encrypted, iv, auth_tag) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(newId(), envId, 'KEY', 'enc', 'iv', 'tag');
    db.prepare('DELETE FROM environments WHERE id = ?').run(envId);
    const secrets = db.prepare('SELECT * FROM secrets WHERE environment_id = ?').all(envId);
    expect(secrets).toHaveLength(0);
  });
});

describe('newId', () => {
  it('returns a 21-char string', () => {
    const id = newId();
    expect(id).toHaveLength(21);
  });

  it('generates unique IDs', () => {
    const ids = new Set(Array.from({ length: 100 }, () => newId()));
    expect(ids.size).toBe(100);
  });
});

describe('config helpers', () => {
  it('set and get config values', () => {
    const db = getDb(dbPath);
    setConfig(db, 'test_key', 'test_value');
    expect(getConfig(db, 'test_key')).toBe('test_value');
  });

  it('returns null for missing keys', () => {
    const db = getDb(dbPath);
    expect(getConfig(db, 'nonexistent')).toBeNull();
  });

  it('overwrites existing config', () => {
    const db = getDb(dbPath);
    setConfig(db, 'key', 'v1');
    setConfig(db, 'key', 'v2');
    expect(getConfig(db, 'key')).toBe('v2');
  });
});

describe('logAudit', () => {
  it('writes an audit entry', () => {
    const db = getDb(dbPath);
    logAudit(db, 'created', 'project', 'p1', 'MyApp', { color: '#fff' });
    const rows = db.prepare('SELECT * FROM audit_log').all() as any[];
    expect(rows).toHaveLength(1);
    expect(rows[0].action).toBe('created');
    expect(rows[0].entity_type).toBe('project');
    expect(rows[0].entity_id).toBe('p1');
    expect(rows[0].entity_name).toBe('MyApp');
    expect(JSON.parse(rows[0].details)).toEqual({ color: '#fff' });
  });
});
