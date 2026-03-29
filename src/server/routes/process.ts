// src/server/routes/process.ts
import type { FastifyInstance } from 'fastify';
import { decrypt } from '../../core/crypto.js';

export async function processRoutes(app: FastifyInstance) {
  // Vault lock guard
  app.addHook('preHandler', async (_req, reply) => {
    try {
      app.vault.requireKey();
    } catch {
      return reply.status(403).send({ error: 'Vault is locked' });
    }
  });

  // POST /process/launch/:projectId
  app.post<{ Params: { projectId: string }; Body: { environment?: string } }>(
    '/process/launch/:projectId',
    async (req, reply) => {
      const project = app.db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.projectId) as any;
      if (!project) return reply.status(404).send({ error: 'Project not found' });

      const commands = JSON.parse(project.start_commands || '[]');
      if (commands.length === 0) {
        return reply.status(400).send({ error: 'No start commands configured' });
      }

      // Already running?
      if (app.processManager.isRunning(project.id)) {
        return reply.status(409).send({ error: 'Project is already running' });
      }

      // Resolve environment for secret injection
      const envSlug = req.body?.environment || project.default_environment || 'dev';
      const environment = app.db
        .prepare('SELECT id FROM environments WHERE project_id = ? AND slug = ?')
        .get(project.id, envSlug) as { id: string } | undefined;

      let secrets: Record<string, string> = {};
      if (environment) {
        const vaultKey = app.vault.requireKey();
        const rows = app.db
          .prepare('SELECT key, value_encrypted, iv, auth_tag FROM secrets WHERE environment_id = ?')
          .all(environment.id) as any[];

        for (const row of rows) {
          secrets[row.key] = decrypt(
            { ciphertext: row.value_encrypted, iv: row.iv, authTag: row.auth_tag },
            vaultKey
          );
        }
      }

      const processes = app.processManager.launch({
        projectId: project.id,
        projectName: project.name,
        commands,
        cwd: project.path || process.cwd(),
        secrets,
      });

      return { success: true, processes };
    }
  );

  // POST /process/stop/:projectId
  app.post<{ Params: { projectId: string } }>(
    '/process/stop/:projectId',
    async (req, reply) => {
      const project = app.db.prepare('SELECT id FROM projects WHERE id = ?').get(req.params.projectId);
      if (!project) return reply.status(404).send({ error: 'Project not found' });

      await app.processManager.stop(req.params.projectId);
      return { success: true };
    }
  );

  // POST /process/restart/:projectId
  app.post<{ Params: { projectId: string }; Body: { environment?: string } }>(
    '/process/restart/:projectId',
    async (req, reply) => {
      const project = app.db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.projectId) as any;
      if (!project) return reply.status(404).send({ error: 'Project not found' });

      const commands = JSON.parse(project.start_commands || '[]');
      if (commands.length === 0) {
        return reply.status(400).send({ error: 'No start commands configured' });
      }

      const envSlug = req.body?.environment || project.default_environment || 'dev';
      const environment = app.db
        .prepare('SELECT id FROM environments WHERE project_id = ? AND slug = ?')
        .get(project.id, envSlug) as { id: string } | undefined;

      let secrets: Record<string, string> = {};
      if (environment) {
        const vaultKey = app.vault.requireKey();
        const rows = app.db
          .prepare('SELECT key, value_encrypted, iv, auth_tag FROM secrets WHERE environment_id = ?')
          .all(environment.id) as any[];

        for (const row of rows) {
          secrets[row.key] = decrypt(
            { ciphertext: row.value_encrypted, iv: row.iv, authTag: row.auth_tag },
            vaultKey
          );
        }
      }

      const processes = await app.processManager.restart(req.params.projectId, {
        projectName: project.name,
        commands,
        cwd: project.path || process.cwd(),
        secrets,
      });

      return { success: true, processes };
    }
  );

  // POST /process/kill/:processId
  app.post<{ Params: { processId: string } }>(
    '/process/kill/:processId',
    async (req) => {
      app.processManager.kill(req.params.processId);
      return { success: true };
    }
  );

  // GET /process/status
  app.get('/process/status', async () => {
    return app.processManager.getAll();
  });

  // GET /process/status/:projectId
  app.get<{ Params: { projectId: string } }>(
    '/process/status/:projectId',
    async (req) => {
      return {
        running: app.processManager.isRunning(req.params.projectId),
        processes: app.processManager.getByProject(req.params.projectId),
      };
    }
  );
}
