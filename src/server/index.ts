// src/server/index.ts
import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import { resolve, join } from 'node:path';
import { existsSync } from 'node:fs';
import { getDb } from '../core/db.js';
import { createVaultState, type VaultState } from './state.js';
import { authRoutes } from './routes/auth.js';
import { projectRoutes } from './routes/projects.js';
import { secretRoutes } from './routes/secrets.js';
import { exportRoutes } from './routes/export.js';
import { processRoutes } from './routes/process.js';
import { ProcessManager } from '../process/manager.js';
import { migrationRoutes } from '../migration/api.js';
import { supabaseRoutes } from './routes/supabase.js';
import { portsRoutes } from './routes/ports.js';
import type Database from 'better-sqlite3';

declare module 'fastify' {
  interface FastifyInstance {
    db: Database.Database;
    vault: VaultState;
    processManager: ProcessManager;
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
  const processManager = new ProcessManager();

  const app = Fastify({
    logger: config.logger ?? false,
  });

  await app.register(cors, { origin: true });
  await app.register(multipart, { limits: { fileSize: 2 * 1024 * 1024 } }); // 2MB max

  app.decorate('db', db);
  app.decorate('vault', vault);
  app.decorate('processManager', processManager);

  await app.register(authRoutes, { prefix: '/api/auth' });
  await app.register(projectRoutes, { prefix: '/api' });
  await app.register(secretRoutes, { prefix: '/api' });
  await app.register(exportRoutes, { prefix: '/api' });
  await app.register(processRoutes, { prefix: '/api' });
  await app.register(migrationRoutes, { prefix: '/api' });
  await app.register(supabaseRoutes, { prefix: '/api' });
  await app.register(portsRoutes, { prefix: '/api' });

  const projectRoot = resolve(import.meta.dirname ?? __dirname, '..', '..');

  // Serve built frontend in production
  const distPath = resolve(projectRoot, 'src', 'web', 'dist');
  if (existsSync(distPath)) {
    await app.register(fastifyStatic, {
      root: distPath,
      prefix: '/',
      wildcard: false,
    });
    // SPA fallback — serve index.html for non-API routes
    app.setNotFoundHandler(async (req, reply) => {
      if (req.url.startsWith('/api/')) {
        return reply.status(404).send({ error: 'Not found' });
      }
      return reply.sendFile('index.html');
    });
  }

  // MCP config endpoint — returns the JSON config for Claude integration
  app.get('/api/mcp-config', async () => {
    return {
      mcpServers: {
        sidekick: {
          type: 'stdio',
          command: 'node',
          args: [join(projectRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs'), join(projectRoot, 'src', 'mcp', 'index.ts')],
          cwd: projectRoot,
          env: {},
        },
      },
    };
  });

  return app;
}

// Start server when run directly
const entry = process.argv[1] ?? '';
if (entry.includes('server/index')) {
  const port = parseInt(process.env.PORT ?? '9999', 10);
  const app = await buildApp({ logger: true });

  app.listen({ port, host: '0.0.0.0' }, async (err, address) => {
    if (err) {
      // If port is taken, check if an existing Sidekick server is already running
      if ((err as NodeJS.ErrnoException).code === 'EADDRINUSE') {
        try {
          const res = await fetch(`http://localhost:${port}/api/auth/status`);
          if (res.ok) {
            console.log(`Sidekick API already running on port ${port} — skipping duplicate server`);
            return;
          }
        } catch { /* not a Sidekick server */ }
      }
      console.error(err);
      process.exit(1);
    }
    console.log(`Sidekick API running at ${address}`);
  });
}
