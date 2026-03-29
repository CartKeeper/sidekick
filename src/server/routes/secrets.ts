// src/server/routes/secrets.ts
import type { FastifyInstance } from 'fastify';
import { newId, logAudit } from '../../core/db.js';
import { encrypt, decrypt } from '../../core/crypto.js';

function detectSecretType(key: string): string {
  const k = key.toUpperCase();
  if (k.includes('API_KEY') || k.includes('APIKEY')) return 'api_key';
  if (k.includes('SECRET') || k.includes('PRIVATE')) return 'secret';
  if (k.includes('TOKEN') || k.includes('JWT')) return 'token';
  if (k.includes('PASSWORD') || k.includes('PASSWD') || k.includes('PWD')) return 'password';
  if (k.includes('DATABASE') || k.includes('DB_') || k.includes('_URL') || k.includes('_URI'))
    return 'connection';
  if (k.includes('WEBHOOK') || k.includes('ENDPOINT')) return 'url';
  if (k.includes('CERTIFICATE') || k.includes('CERT') || k.includes('PEM')) return 'certificate';
  return 'generic';
}

export async function secretRoutes(app: FastifyInstance) {
  // Vault lock guard
  app.addHook('preHandler', async (_req, reply) => {
    try {
      app.vault.requireKey();
    } catch {
      return reply.status(403).send({ error: 'Vault is locked' });
    }
  });

  // GET /environments/:envId/secrets
  app.get<{ Params: { envId: string }; Querystring: { reveal?: string } }>(
    '/environments/:envId/secrets',
    async (req) => {
      const secrets = app.db
        .prepare('SELECT * FROM secrets WHERE environment_id = ? ORDER BY key')
        .all(req.params.envId) as any[];

      const key = app.vault.requireKey();

      return secrets.map((s) => {
        const base: any = {
          id: s.id,
          environment_id: s.environment_id,
          key: s.key,
          type: s.type,
          notes: s.notes,
          created_at: s.created_at,
          updated_at: s.updated_at,
        };
        if (req.query.reveal === 'true') {
          base.value = decrypt(
            { ciphertext: s.value_encrypted, iv: s.iv, authTag: s.auth_tag },
            key
          );
        }
        return base;
      });
    }
  );

  // GET /secrets/:id
  app.get<{ Params: { id: string } }>('/secrets/:id', async (req, reply) => {
    const secret = app.db
      .prepare('SELECT * FROM secrets WHERE id = ?')
      .get(req.params.id) as any;
    if (!secret) return reply.status(404).send({ error: 'Secret not found' });

    const key = app.vault.requireKey();
    const value = decrypt(
      { ciphertext: secret.value_encrypted, iv: secret.iv, authTag: secret.auth_tag },
      key
    );

    logAudit(app.db, 'accessed', 'secret', secret.id, secret.key, {});

    return {
      id: secret.id,
      environment_id: secret.environment_id,
      key: secret.key,
      value,
      type: secret.type,
      notes: secret.notes,
      created_at: secret.created_at,
      updated_at: secret.updated_at,
    };
  });

  // POST /environments/:envId/secrets
  app.post<{
    Params: { envId: string };
    Body: { key: string; value: string; type?: string; notes?: string };
  }>('/environments/:envId/secrets', async (req, reply) => {
    const { key: secretKey, value, type, notes } = req.body;
    const vaultKey = app.vault.requireKey();
    const encrypted = encrypt(value, vaultKey);
    const id = newId();
    const detectedType = type ?? detectSecretType(secretKey);

    try {
      app.db
        .prepare(
          `INSERT INTO secrets (id, environment_id, key, value_encrypted, iv, auth_tag, type, notes)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          id,
          req.params.envId,
          secretKey,
          encrypted.ciphertext,
          encrypted.iv,
          encrypted.authTag,
          detectedType,
          notes ?? ''
        );
    } catch (err: any) {
      if (err.message?.includes('UNIQUE')) {
        return reply
          .status(409)
          .send({ error: `Secret "${secretKey}" already exists in this environment` });
      }
      throw err;
    }

    logAudit(app.db, 'created', 'secret', id, secretKey, { environmentId: req.params.envId });

    return {
      id,
      environment_id: req.params.envId,
      key: secretKey,
      type: detectedType,
      notes: notes ?? '',
    };
  });

  // PUT /secrets/:id
  app.put<{
    Params: { id: string };
    Body: { value?: string; type?: string; notes?: string };
  }>('/secrets/:id', async (req, reply) => {
    const secret = app.db
      .prepare('SELECT * FROM secrets WHERE id = ?')
      .get(req.params.id) as any;
    if (!secret) return reply.status(404).send({ error: 'Secret not found' });

    const { value, type, notes } = req.body;

    if (value !== undefined) {
      const vaultKey = app.vault.requireKey();
      const encrypted = encrypt(value, vaultKey);
      app.db
        .prepare(
          "UPDATE secrets SET value_encrypted = ?, iv = ?, auth_tag = ?, updated_at = datetime('now') WHERE id = ?"
        )
        .run(encrypted.ciphertext, encrypted.iv, encrypted.authTag, req.params.id);
    }
    if (type !== undefined) {
      app.db
        .prepare("UPDATE secrets SET type = ?, updated_at = datetime('now') WHERE id = ?")
        .run(type, req.params.id);
    }
    if (notes !== undefined) {
      app.db
        .prepare("UPDATE secrets SET notes = ?, updated_at = datetime('now') WHERE id = ?")
        .run(notes, req.params.id);
    }

    logAudit(app.db, 'updated', 'secret', secret.id, secret.key, {
      fields: Object.keys(req.body),
    });

    return { success: true };
  });

  // DELETE /secrets/:id
  app.delete<{ Params: { id: string } }>('/secrets/:id', async (req, reply) => {
    const secret = app.db
      .prepare('SELECT * FROM secrets WHERE id = ?')
      .get(req.params.id) as any;
    if (!secret) return reply.status(404).send({ error: 'Secret not found' });

    app.db.prepare('DELETE FROM secrets WHERE id = ?').run(req.params.id);
    logAudit(app.db, 'deleted', 'secret', secret.id, secret.key, {});
    return { success: true };
  });

  // GET /search?q=...
  app.get<{ Querystring: { q: string } }>('/search', async (req) => {
    const results = app.db
      .prepare(
        `SELECT s.*, e.name as environmentName, e.slug as environmentSlug, p.name as projectName, p.id as projectId
        FROM secrets s
        JOIN environments e ON s.environment_id = e.id
        JOIN projects p ON e.project_id = p.id
        WHERE s.key LIKE ? AND p.archived = 0
        ORDER BY s.key
        LIMIT 50`
      )
      .all(`%${req.query.q}%`) as any[];

    return results.map((r) => ({
      id: r.id,
      key: r.key,
      type: r.type,
      projectId: r.projectId,
      projectName: r.projectName,
      environmentName: r.environmentName,
      environmentSlug: r.environmentSlug,
    }));
  });

  // GET /stats
  app.get('/stats', async () => {
    const projectCount = (
      app.db.prepare('SELECT COUNT(*) as c FROM projects WHERE archived = 0').get() as any
    ).c;
    const secretCount = (
      app.db
        .prepare(
          'SELECT COUNT(*) as c FROM secrets s JOIN environments e ON s.environment_id = e.id JOIN projects p ON e.project_id = p.id WHERE p.archived = 0'
        )
        .get() as any
    ).c;
    const environmentCount = (
      app.db
        .prepare(
          'SELECT COUNT(*) as c FROM environments e JOIN projects p ON e.project_id = p.id WHERE p.archived = 0'
        )
        .get() as any
    ).c;

    const recentActivity = app.db
      .prepare('SELECT * FROM audit_log ORDER BY created_at DESC LIMIT 10')
      .all();

    return { projectCount, secretCount, environmentCount, recentActivity };
  });
}
