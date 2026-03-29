// src/__tests__/migration/migration.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import { pbkdf2Sync } from 'node:crypto';
import { generateSalt, deriveKey, encrypt, decrypt } from '../../core/crypto.js';
import { getDb, closeDb } from '../../core/db.js';
import { runMigration, detectSources, type MigrationSource } from '../../migration/index.js';

let tmpDir: string;
let targetDbPath: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'sidekick-migration-test-'));
  targetDbPath = join(tmpDir, 'target.db');
});

afterEach(() => {
  closeDb(targetDbPath);
  rmSync(tmpDir, { recursive: true, force: true });
});

function createFakeInfiscalDb(dbPath: string, password: string) {
  const db = new Database(dbPath);
  db.pragma('foreign_keys = ON');

  // Create Infiscal schema (simplified)
  db.exec(`
    CREATE TABLE vault_config (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE projects (id TEXT PRIMARY KEY, name TEXT UNIQUE, description TEXT DEFAULT '', icon TEXT DEFAULT '', color TEXT DEFAULT '', archived INTEGER DEFAULT 0, sort_order INTEGER DEFAULT 0);
    CREATE TABLE environments (id TEXT PRIMARY KEY, project_id TEXT REFERENCES projects(id), name TEXT, slug TEXT, sort_order INTEGER DEFAULT 0);
    CREATE TABLE secrets (id TEXT PRIMARY KEY, environment_id TEXT REFERENCES environments(id), key TEXT, value_encrypted TEXT, iv TEXT, auth_tag TEXT, type TEXT DEFAULT 'generic', notes TEXT DEFAULT '');
  `);

  const salt = generateSalt();
  // Match Infiscal's key derivation: salt as Buffer, not string
  const key = pbkdf2Sync(password, Buffer.from(salt, 'hex'), 100_000, 32, 'sha512');

  const hash = bcrypt.hashSync(password, 12);

  db.prepare("INSERT INTO vault_config VALUES ('password_hash', ?)").run(hash);
  db.prepare("INSERT INTO vault_config VALUES ('encryption_salt', ?)").run(salt);

  // Add a project with secrets
  db.prepare("INSERT INTO projects (id, name) VALUES ('p1', 'MyApp')").run();
  db.prepare("INSERT INTO environments (id, project_id, name, slug) VALUES ('e1', 'p1', 'Dev', 'dev')").run();

  const enc1 = encrypt('secret-value-1', key);
  const enc2 = encrypt('secret-value-2', key);
  db.prepare('INSERT INTO secrets (id, environment_id, key, value_encrypted, iv, auth_tag, type) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run('s1', 'e1', 'API_KEY', enc1.ciphertext, enc1.iv, enc1.authTag, 'api_key');
  db.prepare('INSERT INTO secrets (id, environment_id, key, value_encrypted, iv, auth_tag, type) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run('s2', 'e1', 'DB_URL', enc2.ciphertext, enc2.iv, enc2.authTag, 'connection');

  db.close();
  return { salt, key };
}

function createFakeDevrunJson(jsonPath: string) {
  const projects = [
    {
      id: 'dr1',
      name: 'MyApp',
      description: 'Existing app',
      path: '/Users/test/myapp',
      startCommand: 'npm run dev',
      startCommands: [
        { name: 'Frontend', command: 'npm run dev', path: '/Users/test/myapp/web' },
        { name: 'Backend', command: 'npm start', path: '/Users/test/myapp/api' },
      ],
      devUrl: 'http://localhost:3000',
      stack: ['React', 'Node'],
      color: '#10B981',
      actions: { terminal: true, vscode: true, browser: true },
    },
    {
      id: 'dr2',
      name: 'OtherApp',
      path: '/Users/test/other',
      startCommand: 'python manage.py runserver',
      stack: ['Python', 'Django'],
    },
  ];
  writeFileSync(jsonPath, JSON.stringify(projects, null, 2));
}

describe('migration', () => {
  it('migrates Infiscal projects and re-encrypts secrets', async () => {
    const infiscalPath = join(tmpDir, 'infiscal.db');
    createFakeInfiscalDb(infiscalPath, 'old-password');

    // Setup target DB
    const targetDb = getDb(targetDbPath);
    const newSalt = generateSalt();
    const newKey = deriveKey('new-password', newSalt);

    const sources: MigrationSource[] = [
      { type: 'infiscal', path: infiscalPath, exists: true },
    ];

    const result = await runMigration({
      sources,
      infiscalPassword: 'old-password',
      newVaultKey: newKey,
      targetDbPath,
    });

    expect(result.errors).toHaveLength(0);
    expect(result.imported.projects).toBe(1);
    expect(result.imported.secrets).toBe(2);

    // Verify secrets are readable with new key
    const envs = targetDb.prepare('SELECT id FROM environments').all() as any[];
    const secrets = targetDb.prepare('SELECT * FROM secrets WHERE environment_id = ?').all(envs[0].id) as any[];
    expect(secrets).toHaveLength(2);

    const decrypted = decrypt(
      { ciphertext: secrets[0].value_encrypted, iv: secrets[0].iv, authTag: secrets[0].auth_tag },
      newKey
    );
    expect(['secret-value-1', 'secret-value-2']).toContain(decrypted);
  });

  it('migrates Devrun projects with launch config', async () => {
    const devrunPath = join(tmpDir, 'projects.json');
    createFakeDevrunJson(devrunPath);

    const targetDb = getDb(targetDbPath);
    const newKey = deriveKey('pw', generateSalt());

    const sources: MigrationSource[] = [
      { type: 'devrun', path: devrunPath, exists: true },
    ];

    const result = await runMigration({
      sources,
      newVaultKey: newKey,
      targetDbPath,
    });

    expect(result.errors).toHaveLength(0);
    expect(result.imported.projects).toBe(2);

    const projects = targetDb.prepare('SELECT * FROM projects ORDER BY name').all() as any[];
    expect(projects).toHaveLength(2);

    const myApp = projects.find((p: any) => p.name === 'MyApp');
    expect(JSON.parse(myApp.start_commands)).toHaveLength(2);
    expect(myApp.dev_url).toBe('http://localhost:3000');
    expect(JSON.parse(myApp.stack)).toEqual(['React', 'Node']);
  });

  it('merges projects that exist in both Infiscal and Devrun', async () => {
    const infiscalPath = join(tmpDir, 'infiscal.db');
    createFakeInfiscalDb(infiscalPath, 'pw');

    const devrunPath = join(tmpDir, 'projects.json');
    createFakeDevrunJson(devrunPath); // Contains "MyApp" which matches Infiscal

    const targetDb = getDb(targetDbPath);
    const newKey = deriveKey('pw', generateSalt());

    const sources: MigrationSource[] = [
      { type: 'infiscal', path: infiscalPath, exists: true },
      { type: 'devrun', path: devrunPath, exists: true },
    ];

    const result = await runMigration({
      sources,
      infiscalPassword: 'pw',
      newVaultKey: newKey,
      targetDbPath,
    });

    expect(result.errors).toHaveLength(0);
    expect(result.imported.merged).toBe(1); // MyApp was merged
    expect(result.imported.projects).toBe(2); // MyApp from Infiscal + OtherApp from Devrun

    // MyApp should have both secrets (from Infiscal) AND launch config (from Devrun)
    const myApp = targetDb.prepare("SELECT * FROM projects WHERE name = 'MyApp'").get() as any;
    expect(myApp).toBeTruthy();
    expect(JSON.parse(myApp.start_commands)).toHaveLength(2);
    expect(myApp.dev_url).toBe('http://localhost:3000');

    // Secrets should exist
    const envs = targetDb.prepare('SELECT id FROM environments WHERE project_id = ?').all(myApp.id) as any[];
    const secrets = targetDb.prepare('SELECT * FROM secrets WHERE environment_id = ?').all(envs[0].id) as any[];
    expect(secrets).toHaveLength(2);
  });

  it('rejects invalid Infiscal password', async () => {
    const infiscalPath = join(tmpDir, 'infiscal.db');
    createFakeInfiscalDb(infiscalPath, 'correct-pw');

    const newKey = deriveKey('pw', generateSalt());

    const result = await runMigration({
      sources: [{ type: 'infiscal', path: infiscalPath, exists: true }],
      infiscalPassword: 'wrong-pw',
      newVaultKey: newKey,
      targetDbPath,
    });

    expect(result.errors).toContain('Invalid Infiscal master password');
    expect(result.imported.projects).toBe(0);
  });
});
