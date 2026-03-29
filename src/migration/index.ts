// src/migration/index.ts
import { existsSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import Database from 'better-sqlite3';
import { pbkdf2Sync } from 'node:crypto';
import { decrypt, encrypt, verifyPassword } from '../core/crypto.js';
import { getDb, newId, logAudit } from '../core/db.js';

export interface MigrationSource {
  type: 'infiscal' | 'devrun';
  path: string;
  exists: boolean;
}

export interface MigrationPreview {
  infiscal: {
    found: boolean;
    path: string;
    projectCount: number;
    secretCount: number;
    projects: { name: string; envCount: number; secretCount: number }[];
  } | null;
  devrun: {
    found: boolean;
    path: string;
    projectCount: number;
    projects: { name: string; path: string; commands: number }[];
  } | null;
  mergeableCount: number;
}

export interface MigrationResult {
  imported: {
    projects: number;
    environments: number;
    secrets: number;
    merged: number;
  };
  errors: string[];
}

/**
 * Detect existing data sources
 */
export function detectSources(): MigrationSource[] {
  const home = homedir();
  const sources: MigrationSource[] = [];

  // Infiscal locations (check primary first, then fallback)
  const infiscalPaths = [
    join(home, 'Library', 'Application Support', 'Infiscal', 'infiscal.db'),
    join(home, 'infiscal', 'data', 'infiscal.db'),
  ];

  for (const p of infiscalPaths) {
    if (existsSync(p)) {
      sources.push({ type: 'infiscal', path: p, exists: true });
      break;
    }
  }

  // Devrun location
  const devrunPath = join(home, 'Library', 'Application Support', 'dev-launcher', 'projects.json');
  if (existsSync(devrunPath)) {
    sources.push({ type: 'devrun', path: devrunPath, exists: true });
  }

  return sources;
}

/**
 * Preview what would be migrated (without actually migrating)
 */
export function previewMigration(sources: MigrationSource[]): MigrationPreview {
  const preview: MigrationPreview = {
    infiscal: null,
    devrun: null,
    mergeableCount: 0,
  };

  const infiscalSource = sources.find((s) => s.type === 'infiscal' && s.exists);
  if (infiscalSource) {
    try {
      const oldDb = new Database(infiscalSource.path, { readonly: true });
      oldDb.pragma('foreign_keys = ON');

      const projects = oldDb
        .prepare(
          `SELECT p.name,
            (SELECT COUNT(*) FROM environments WHERE project_id = p.id) as envCount,
            (SELECT COUNT(*) FROM secrets s JOIN environments e ON s.environment_id = e.id WHERE e.project_id = p.id) as secretCount
          FROM projects p WHERE p.archived = 0`
        )
        .all() as any[];

      const totalSecrets = projects.reduce((sum: number, p: any) => sum + p.secretCount, 0);

      preview.infiscal = {
        found: true,
        path: infiscalSource.path,
        projectCount: projects.length,
        secretCount: totalSecrets,
        projects: projects.map((p) => ({ name: p.name, envCount: p.envCount, secretCount: p.secretCount })),
      };

      oldDb.close();
    } catch (err: any) {
      preview.infiscal = {
        found: true,
        path: infiscalSource.path,
        projectCount: 0,
        secretCount: 0,
        projects: [],
      };
    }
  }

  const devrunSource = sources.find((s) => s.type === 'devrun' && s.exists);
  if (devrunSource) {
    try {
      const content = readFileSync(devrunSource.path, 'utf8');
      const projects = JSON.parse(content) as any[];

      preview.devrun = {
        found: true,
        path: devrunSource.path,
        projectCount: projects.length,
        projects: projects.map((p) => ({
          name: p.name,
          path: p.path || '',
          commands: (p.startCommands || []).length + (p.startCommand ? 1 : 0),
        })),
      };
    } catch {
      preview.devrun = {
        found: true,
        path: devrunSource.path,
        projectCount: 0,
        projects: [],
      };
    }
  }

  // Count mergeable projects (same name appears in both)
  if (preview.infiscal && preview.devrun) {
    const infiscalNames = new Set(preview.infiscal.projects.map((p) => p.name.toLowerCase()));
    preview.mergeableCount = preview.devrun.projects.filter((p) =>
      infiscalNames.has(p.name.toLowerCase())
    ).length;
  }

  return preview;
}

/**
 * Run the full migration
 */
export async function runMigration(opts: {
  sources: MigrationSource[];
  infiscalPassword?: string;
  newVaultKey: Buffer;
  targetDbPath?: string;
}): Promise<MigrationResult> {
  const { sources, infiscalPassword, newVaultKey, targetDbPath } = opts;
  const targetDb = getDb(targetDbPath);
  const result: MigrationResult = {
    imported: { projects: 0, environments: 0, secrets: 0, merged: 0 },
    errors: [],
  };

  // Track imported projects by name (lowercase) for merge matching
  const importedProjects = new Map<string, string>(); // lowercase name → project ID

  // --- Migrate Infiscal ---
  const infiscalSource = sources.find((s) => s.type === 'infiscal' && s.exists);
  if (infiscalSource && infiscalPassword) {
    try {
      const oldDb = new Database(infiscalSource.path, { readonly: true });
      oldDb.pragma('foreign_keys = ON');

      // Verify the old password
      const oldHash = oldDb.prepare("SELECT value FROM vault_config WHERE key = 'password_hash'").get() as any;
      const oldSalt = oldDb.prepare("SELECT value FROM vault_config WHERE key = 'encryption_salt'").get() as any;

      if (!oldHash || !oldSalt) {
        result.errors.push('Infiscal vault config not found');
        oldDb.close();
      } else {
        const valid = await verifyPassword(infiscalPassword, oldHash.value);
        if (!valid) {
          result.errors.push('Invalid Infiscal master password');
          oldDb.close();
        } else {
          // Infiscal converts hex salt to Buffer before PBKDF2 — must match exactly
          const oldKey = pbkdf2Sync(
            infiscalPassword,
            Buffer.from(oldSalt.value, 'hex'),
            100_000,
            32,
            'sha512'
          );

          // Get all projects
          const oldProjects = oldDb
            .prepare('SELECT * FROM projects WHERE archived = 0')
            .all() as any[];

          for (const oldProj of oldProjects) {
            const projId = newId();
            try {
              targetDb
                .prepare(
                  `INSERT INTO projects (id, name, description, icon, color, sort_order)
                  VALUES (?, ?, ?, ?, ?, ?)`
                )
                .run(projId, oldProj.name, oldProj.description || '', oldProj.icon || '', oldProj.color || '#6366f1', oldProj.sort_order || 0);

              importedProjects.set(oldProj.name.toLowerCase(), projId);
              result.imported.projects++;
            } catch (err: any) {
              if (err.message?.includes('UNIQUE')) {
                result.errors.push(`Skipped duplicate project: ${oldProj.name}`);
                continue;
              }
              throw err;
            }

            // Migrate environments
            const oldEnvs = oldDb
              .prepare('SELECT * FROM environments WHERE project_id = ?')
              .all(oldProj.id) as any[];

            for (const oldEnv of oldEnvs) {
              const envId = newId();
              try {
                targetDb
                  .prepare('INSERT INTO environments (id, project_id, name, slug, sort_order) VALUES (?, ?, ?, ?, ?)')
                  .run(envId, projId, oldEnv.name, oldEnv.slug, oldEnv.sort_order || 0);
                result.imported.environments++;
              } catch {
                continue;
              }

              // Migrate secrets (decrypt with old key, re-encrypt with new key)
              const oldSecrets = oldDb
                .prepare('SELECT * FROM secrets WHERE environment_id = ?')
                .all(oldEnv.id) as any[];

              for (const oldSecret of oldSecrets) {
                try {
                  const plaintext = decrypt(
                    { ciphertext: oldSecret.value_encrypted, iv: oldSecret.iv, authTag: oldSecret.auth_tag },
                    oldKey
                  );
                  const encrypted = encrypt(plaintext, newVaultKey);

                  targetDb
                    .prepare(
                      'INSERT INTO secrets (id, environment_id, key, value_encrypted, iv, auth_tag, type, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
                    )
                    .run(
                      newId(),
                      envId,
                      oldSecret.key,
                      encrypted.ciphertext,
                      encrypted.iv,
                      encrypted.authTag,
                      oldSecret.type || 'generic',
                      oldSecret.notes || ''
                    );
                  result.imported.secrets++;
                } catch (err: any) {
                  result.errors.push(`Failed to migrate secret ${oldSecret.key}: ${err.message}`);
                }
              }
            }
          }

          oldDb.close();
        }
      }
    } catch (err: any) {
      result.errors.push(`Infiscal migration error: ${err.message}`);
    }
  }

  // --- Migrate Devrun ---
  const devrunSource = sources.find((s) => s.type === 'devrun' && s.exists);
  if (devrunSource) {
    try {
      const content = readFileSync(devrunSource.path, 'utf8');
      const devrunProjects = JSON.parse(content) as any[];

      for (const dp of devrunProjects) {
        if (!dp.name) continue;

        // Check if this project was already imported from Infiscal (merge)
        const existingId = importedProjects.get(dp.name.toLowerCase());

        if (existingId) {
          // Merge: update the existing project with Devrun's launch config
          const startCommands = dp.startCommands?.length
            ? dp.startCommands.map((c: any) => ({
                name: c.name || 'default',
                command: c.command,
                path: c.path,
              }))
            : dp.startCommand
              ? [{ name: 'default', command: dp.startCommand }]
              : [];

          targetDb
            .prepare(
              `UPDATE projects SET
                path = ?, start_commands = ?, dev_url = ?, stack = ?,
                enable_terminal = ?, enable_vscode = ?, enable_browser = ?,
                updated_at = datetime('now')
              WHERE id = ?`
            )
            .run(
              dp.path || '',
              JSON.stringify(startCommands),
              dp.devUrl || '',
              JSON.stringify(dp.stack || []),
              dp.actions?.terminal !== false ? 1 : 0,
              dp.actions?.vscode !== false ? 1 : 0,
              dp.actions?.browser === true ? 1 : 0,
              existingId
            );
          result.imported.merged++;
        } else {
          // New project from Devrun only
          const projId = newId();
          const startCommands = dp.startCommands?.length
            ? dp.startCommands.map((c: any) => ({
                name: c.name || 'default',
                command: c.command,
                path: c.path,
              }))
            : dp.startCommand
              ? [{ name: 'default', command: dp.startCommand }]
              : [];

          try {
            targetDb
              .prepare(
                `INSERT INTO projects (id, name, description, icon, color, path, start_commands, dev_url, stack, enable_terminal, enable_vscode, enable_browser)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
              )
              .run(
                projId,
                dp.name,
                dp.description || '',
                dp.icon || '',
                dp.color || '#6366f1',
                dp.path || '',
                JSON.stringify(startCommands),
                dp.devUrl || '',
                JSON.stringify(dp.stack || []),
                dp.actions?.terminal !== false ? 1 : 0,
                dp.actions?.vscode !== false ? 1 : 0,
                dp.actions?.browser === true ? 1 : 0
              );

            // Create default environments for Devrun-only projects
            const defaultEnvs = ['Dev', 'Staging', 'Prod'];
            for (let i = 0; i < defaultEnvs.length; i++) {
              targetDb
                .prepare('INSERT INTO environments (id, project_id, name, slug, sort_order) VALUES (?, ?, ?, ?, ?)')
                .run(newId(), projId, defaultEnvs[i], defaultEnvs[i].toLowerCase(), i);
            }

            importedProjects.set(dp.name.toLowerCase(), projId);
            result.imported.projects++;
          } catch (err: any) {
            if (err.message?.includes('UNIQUE')) {
              result.errors.push(`Skipped duplicate project: ${dp.name}`);
            } else {
              result.errors.push(`Devrun import error for ${dp.name}: ${err.message}`);
            }
          }
        }
      }
    } catch (err: any) {
      result.errors.push(`Devrun migration error: ${err.message}`);
    }
  }

  logAudit(targetDb, 'migration_completed', 'vault', 'vault', 'vault', {
    ...result.imported,
    errorCount: result.errors.length,
  });

  return result;
}
