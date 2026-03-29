// src/__tests__/helpers/server.ts
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { rmSync } from 'node:fs';
import { buildApp } from '../../server/index.js';
import type { FastifyInstance } from 'fastify';
import { closeDb } from '../../core/db.js';

export interface TestContext {
  app: FastifyInstance;
  dbPath: string;
  tmpDir: string;
  cleanup: () => void;
}

export async function createTestApp(): Promise<TestContext> {
  const tmpDir = mkdtempSync(join(tmpdir(), 'sidekick-test-'));
  const dbPath = join(tmpDir, 'test.db');
  const app = await buildApp({ dbPath });

  return {
    app,
    dbPath,
    tmpDir,
    cleanup: () => {
      closeDb(dbPath);
      rmSync(tmpDir, { recursive: true, force: true });
    },
  };
}

export async function setupAndUnlock(app: FastifyInstance, password = 'test-password') {
  await app.inject({
    method: 'POST',
    url: '/api/auth/setup',
    payload: { password, enableKeychain: false },
  });
  await app.inject({
    method: 'POST',
    url: '/api/auth/unlock',
    payload: { password },
  });
}
