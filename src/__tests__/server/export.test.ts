// src/__tests__/server/export.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestApp, setupAndUnlock, type TestContext } from '../helpers/server.js';

let ctx: TestContext;
let projectId: string;
let envId: string;

beforeEach(async () => {
  ctx = await createTestApp();
  await setupAndUnlock(ctx.app);

  const projRes = await ctx.app.inject({
    method: 'POST',
    url: '/api/projects',
    payload: { name: 'ExportTest' },
  });
  projectId = projRes.json().id;

  const envsRes = await ctx.app.inject({
    method: 'GET',
    url: `/api/projects/${projectId}/environments`,
  });
  envId = envsRes.json()[0].id;

  for (const [key, value] of [['API_KEY', 'abc123'], ['DB_URL', 'postgres://host/db'], ['SECRET', 'shhh']]) {
    await ctx.app.inject({
      method: 'POST',
      url: `/api/environments/${envId}/secrets`,
      payload: { key, value },
    });
  }
});

afterEach(() => {
  ctx.cleanup();
});

describe('GET /api/projects/:projectId/export', () => {
  it('exports all secrets as dotenv format', async () => {
    const envsRes = await ctx.app.inject({
      method: 'GET',
      url: `/api/projects/${projectId}/environments`,
    });
    const envSlug = envsRes.json()[0].slug;

    const res = await ctx.app.inject({
      method: 'GET',
      url: `/api/projects/${projectId}/export?env=${envSlug}&format=dotenv`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.body;
    expect(body).toContain('API_KEY="abc123"');
    expect(body).toContain('DB_URL="postgres://host/db"');
    expect(body).toContain('SECRET="shhh"');
  });

  it('exports specific keys only', async () => {
    const envsRes = await ctx.app.inject({
      method: 'GET',
      url: `/api/projects/${projectId}/environments`,
    });
    const envSlug = envsRes.json()[0].slug;

    const res = await ctx.app.inject({
      method: 'GET',
      url: `/api/projects/${projectId}/export?env=${envSlug}&format=dotenv&keys=API_KEY,SECRET`,
    });
    expect(res.body).toContain('API_KEY="abc123"');
    expect(res.body).toContain('SECRET="shhh"');
    expect(res.body).not.toContain('DB_URL');
  });

  it('exports as JSON format', async () => {
    const envsRes = await ctx.app.inject({
      method: 'GET',
      url: `/api/projects/${projectId}/environments`,
    });
    const envSlug = envsRes.json()[0].slug;

    const res = await ctx.app.inject({
      method: 'GET',
      url: `/api/projects/${projectId}/export?env=${envSlug}&format=json`,
    });
    const json = res.json();
    expect(json.API_KEY).toBe('abc123');
    expect(json.DB_URL).toBe('postgres://host/db');
  });
});

describe('POST /api/projects/:projectId/import', () => {
  it('imports from dotenv format', async () => {
    const proj2Res = await ctx.app.inject({
      method: 'POST',
      url: '/api/projects',
      payload: { name: 'ImportTarget' },
    });
    const proj2Id = proj2Res.json().id;
    const envs2Res = await ctx.app.inject({
      method: 'GET',
      url: `/api/projects/${proj2Id}/environments`,
    });
    const env2Slug = envs2Res.json()[0].slug;

    const dotenv = `NEW_KEY="value1"\nANOTHER_KEY="value2"\n# comment line\n\nTHIRD_KEY=unquoted`;

    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/projects/${proj2Id}/import`,
      payload: { env: env2Slug, format: 'dotenv', content: dotenv },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().imported).toBe(3);

    const env2Id = envs2Res.json()[0].id;
    const secretsRes = await ctx.app.inject({
      method: 'GET',
      url: `/api/environments/${env2Id}/secrets?reveal=true`,
    });
    const secrets = secretsRes.json();
    expect(secrets).toHaveLength(3);
    const keys = secrets.map((s: any) => s.key);
    expect(keys).toContain('NEW_KEY');
    expect(keys).toContain('ANOTHER_KEY');
    expect(keys).toContain('THIRD_KEY');
  });

  it('imports from JSON format', async () => {
    const proj2Res = await ctx.app.inject({
      method: 'POST',
      url: '/api/projects',
      payload: { name: 'JsonImport' },
    });
    const proj2Id = proj2Res.json().id;
    const envs2Res = await ctx.app.inject({
      method: 'GET',
      url: `/api/projects/${proj2Id}/environments`,
    });
    const env2Slug = envs2Res.json()[0].slug;

    const jsonContent = JSON.stringify({ FOO: 'bar', BAZ: 'qux' });

    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/projects/${proj2Id}/import`,
      payload: { env: env2Slug, format: 'json', content: jsonContent },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().imported).toBe(2);
  });

  it('overwrites existing secrets when overwrite=true', async () => {
    const envsRes = await ctx.app.inject({
      method: 'GET',
      url: `/api/projects/${projectId}/environments`,
    });
    const envSlug = envsRes.json()[0].slug;

    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/import`,
      payload: {
        env: envSlug,
        format: 'json',
        content: JSON.stringify({ API_KEY: 'new-value' }),
        overwrite: true,
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().imported).toBe(1);

    const secretsRes = await ctx.app.inject({
      method: 'GET',
      url: `/api/environments/${envId}/secrets?reveal=true`,
    });
    const apiKeySecret = secretsRes.json().find((s: any) => s.key === 'API_KEY');
    expect(apiKeySecret.value).toBe('new-value');
  });
});
