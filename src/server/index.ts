// src/server/index.ts
import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { getDb } from '../core/db.js';
import { createVaultState, type VaultState } from './state.js';
import { authRoutes } from './routes/auth.js';
import { projectRoutes } from './routes/projects.js';
import { secretRoutes } from './routes/secrets.js';
import { exportRoutes } from './routes/export.js';
import type Database from 'better-sqlite3';

declare module 'fastify' {
  interface FastifyInstance {
    db: Database.Database;
    vault: VaultState;
  }
}

export interface AppConfig {
  dbPath?: string;
  port?: number;
  logger?: boolean;
}

export async function buildApp(config: AppConfig = {}): Promise<FastifyInstance> {
  const db = getDb(config.dbPath);
  const vault = createVaultState();

  const app = Fastify({
    logger: config.logger ?? false,
  });

  await app.register(cors, { origin: true });

  app.decorate('db', db);
  app.decorate('vault', vault);

  await app.register(authRoutes, { prefix: '/api/auth' });
  await app.register(projectRoutes, { prefix: '/api' });
  await app.register(secretRoutes, { prefix: '/api' });
  await app.register(exportRoutes, { prefix: '/api' });

  return app;
}

// Start server when run directly
const entry = process.argv[1] ?? '';
if (entry.includes('server/index')) {
  const port = parseInt(process.env.PORT ?? '3778', 10);
  const app = await buildApp({ logger: true });

  app.listen({ port, host: '0.0.0.0' }, (err, address) => {
    if (err) {
      console.error(err);
      process.exit(1);
    }
    console.log(`Sidekick API running at ${address}`);
  });
}
