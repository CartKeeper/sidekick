// src/migration/api.ts
import type { FastifyInstance } from 'fastify';
import { detectSources, previewMigration, runMigration } from './index.js';
import { getConfig } from '../core/db.js';

export async function migrationRoutes(app: FastifyInstance) {
  // GET /migration/detect — check for existing data sources
  app.get('/migration/detect', async () => {
    const sources = detectSources();
    const preview = previewMigration(sources);
    return { sources, preview };
  });

  // POST /migration/run — execute the migration
  app.post<{
    Body: { infiscalPassword?: string };
  }>('/migration/run', async (req, reply) => {
    const vaultKey = app.vault.getKey();
    if (!vaultKey) {
      return reply.status(403).send({ error: 'Vault must be unlocked before migration' });
    }

    const sources = detectSources();
    if (sources.length === 0) {
      return reply.status(404).send({ error: 'No migration sources found' });
    }

    const result = await runMigration({
      sources,
      infiscalPassword: req.body?.infiscalPassword,
      newVaultKey: vaultKey,
    });

    return result;
  });
}
