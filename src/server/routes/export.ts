// src/server/routes/export.ts
import type { FastifyInstance } from 'fastify';
import { newId, logAudit } from '../../core/db.js';
import { encrypt, decrypt } from '../../core/crypto.js';

function detectSecretType(key: string): string {
  const k = key.toUpperCase();
  if (k.includes('API_KEY') || k.includes('APIKEY')) return 'api_key';
  if (k.includes('SECRET') || k.includes('PRIVATE')) return 'secret';
  if (k.includes('TOKEN') || k.includes('JWT')) return 'token';
  if (k.includes('PASSWORD') || k.includes('PASSWD') || k.includes('PWD')) return 'password';
  if (k.includes('DATABASE') || k.includes('DB_') || k.includes('_URL') || k.includes('_URI')) return 'connection';
  return 'generic';
}

function parseDotenv(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key) result[key] = value;
  }
  return result;
}

export async function exportRoutes(app: FastifyInstance) {
  // Vault lock guard
  app.addHook('preHandler', async (_req, reply) => {
    try {
      app.vault.requireKey();
    } catch {
      return reply.status(403).send({ error: 'Vault is locked' });
    }
  });

  // GET /projects/:projectId/export?env=slug&format=dotenv|json&keys=KEY1,KEY2
  app.get<{
    Params: { projectId: string };
    Querystring: { env: string; format?: string; keys?: string };
  }>('/projects/:projectId/export', async (req, reply) => {
    const { env: envSlug, format = 'dotenv', keys: keysParam } = req.query;

    const environment = app.db
      .prepare('SELECT id FROM environments WHERE project_id = ? AND slug = ?')
      .get(req.params.projectId, envSlug) as { id: string } | undefined;

    if (!environment) return reply.status(404).send({ error: `Environment "${envSlug}" not found` });

    const vaultKey = app.vault.requireKey();
    let secrets = app.db
      .prepare('SELECT * FROM secrets WHERE environment_id = ? ORDER BY key')
      .all(environment.id) as any[];

    if (keysParam) {
      const allowedKeys = new Set(keysParam.split(',').map((k) => k.trim()));
      secrets = secrets.filter((s) => allowedKeys.has(s.key));
    }

    const decrypted: Record<string, string> = {};
    for (const s of secrets) {
      decrypted[s.key] = decrypt(
        { ciphertext: s.value_encrypted, iv: s.iv, authTag: s.auth_tag },
        vaultKey
      );
    }

    logAudit(app.db, 'exported', 'project', req.params.projectId, '', {
      environment: envSlug,
      format,
      secretCount: secrets.length,
    });

    if (format === 'json') {
      return decrypted;
    }

    const lines = Object.entries(decrypted).map(([k, v]) => `${k}="${v}"`);
    return reply.type('text/plain').send(lines.join('\n') + '\n');
  });

  // POST /projects/:projectId/import
  app.post<{
    Params: { projectId: string };
    Body: { env: string; format: string; content: string; overwrite?: boolean };
  }>('/projects/:projectId/import', async (req, reply) => {
    const { env: envSlug, format, content, overwrite } = req.body;

    const environment = app.db
      .prepare('SELECT id FROM environments WHERE project_id = ? AND slug = ?')
      .get(req.params.projectId, envSlug) as { id: string } | undefined;

    if (!environment) return reply.status(404).send({ error: `Environment "${envSlug}" not found` });

    let entries: Record<string, string>;
    if (format === 'json') {
      entries = JSON.parse(content);
    } else {
      entries = parseDotenv(content);
    }

    const vaultKey = app.vault.requireKey();
    let imported = 0;

    const insertStmt = app.db.prepare(
      `INSERT INTO secrets (id, environment_id, key, value_encrypted, iv, auth_tag, type)
      VALUES (?, ?, ?, ?, ?, ?, ?)`
    );

    const updateStmt = app.db.prepare(
      `UPDATE secrets SET value_encrypted = ?, iv = ?, auth_tag = ?, updated_at = datetime('now') WHERE environment_id = ? AND key = ?`
    );

    const importTx = app.db.transaction(() => {
      for (const [key, value] of Object.entries(entries)) {
        const encrypted = encrypt(String(value), vaultKey);
        const existing = app.db
          .prepare('SELECT id FROM secrets WHERE environment_id = ? AND key = ?')
          .get(environment.id, key);

        if (existing) {
          if (overwrite) {
            updateStmt.run(encrypted.ciphertext, encrypted.iv, encrypted.authTag, environment.id, key);
            imported++;
          }
        } else {
          insertStmt.run(
            newId(),
            environment.id,
            key,
            encrypted.ciphertext,
            encrypted.iv,
            encrypted.authTag,
            detectSecretType(key)
          );
          imported++;
        }
      }
    });

    importTx();

    logAudit(app.db, 'imported', 'project', req.params.projectId, '', {
      environment: envSlug,
      format,
      imported,
      total: Object.keys(entries).length,
    });

    return { success: true, imported };
  });
}
