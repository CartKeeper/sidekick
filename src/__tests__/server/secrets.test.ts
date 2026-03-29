// src/__tests__/server/secrets.test.ts
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
    payload: { name: 'SecretTest' },
  });
  projectId = projRes.json().id;

  const envsRes = await ctx.app.inject({
    method: 'GET',
    url: `/api/projects/${projectId}/environments`,
  });
  envId = envsRes.json()[0].id;
});

afterEach(() => {
  ctx.cleanup();
});

describe('POST /api/environments/:envId/secrets', () => {
  it('creates an encrypted secret', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/environments/${envId}/secrets`,
      payload: { key: 'API_KEY', value: 'sk-12345' },
    });
    expect(res.statusCode).toBe(200);
    const secret = res.json();
    expect(secret.key).toBe('API_KEY');
    expect(secret).not.toHaveProperty('value');
    expect(secret.type).toBe('api_key');
  });

  it('rejects duplicate keys in same environment', async () => {
    await ctx.app.inject({
      method: 'POST',
      url: `/api/environments/${envId}/secrets`,
      payload: { key: 'DUP', value: 'v1' },
    });
    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/environments/${envId}/secrets`,
      payload: { key: 'DUP', value: 'v2' },
    });
    expect(res.statusCode).toBe(409);
  });
});

describe('GET /api/environments/:envId/secrets', () => {
  it('lists secrets with hidden values by default', async () => {
    await ctx.app.inject({
      method: 'POST',
      url: `/api/environments/${envId}/secrets`,
      payload: { key: 'SECRET', value: 'hidden-value' },
    });

    const res = await ctx.app.inject({
      method: 'GET',
      url: `/api/environments/${envId}/secrets`,
    });
    const secrets = res.json();
    expect(secrets).toHaveLength(1);
    expect(secrets[0].key).toBe('SECRET');
    expect(secrets[0].value).toBeUndefined();
  });

  it('reveals values when reveal=true', async () => {
    await ctx.app.inject({
      method: 'POST',
      url: `/api/environments/${envId}/secrets`,
      payload: { key: 'VISIBLE', value: 'the-value' },
    });

    const res = await ctx.app.inject({
      method: 'GET',
      url: `/api/environments/${envId}/secrets?reveal=true`,
    });
    const secrets = res.json();
    expect(secrets[0].value).toBe('the-value');
  });
});

describe('GET /api/secrets/:id', () => {
  it('returns a single decrypted secret and logs access', async () => {
    const createRes = await ctx.app.inject({
      method: 'POST',
      url: `/api/environments/${envId}/secrets`,
      payload: { key: 'SINGLE', value: 'my-secret' },
    });
    const secretId = createRes.json().id;

    const res = await ctx.app.inject({
      method: 'GET',
      url: `/api/secrets/${secretId}`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().value).toBe('my-secret');

    const activity = await ctx.app.inject({ method: 'GET', url: '/api/activity' });
    const logs = activity.json();
    const accessLog = logs.find((l: any) => l.action === 'accessed');
    expect(accessLog).toBeTruthy();
    expect(accessLog.entity_id).toBe(secretId);
  });
});

describe('PUT /api/secrets/:id', () => {
  it('updates a secret value', async () => {
    const createRes = await ctx.app.inject({
      method: 'POST',
      url: `/api/environments/${envId}/secrets`,
      payload: { key: 'UPDATABLE', value: 'old' },
    });
    const secretId = createRes.json().id;

    const res = await ctx.app.inject({
      method: 'PUT',
      url: `/api/secrets/${secretId}`,
      payload: { value: 'new-value', notes: 'updated for prod' },
    });
    expect(res.statusCode).toBe(200);

    const getRes = await ctx.app.inject({
      method: 'GET',
      url: `/api/secrets/${secretId}`,
    });
    expect(getRes.json().value).toBe('new-value');
    expect(getRes.json().notes).toBe('updated for prod');
  });
});

describe('DELETE /api/secrets/:id', () => {
  it('deletes a secret', async () => {
    const createRes = await ctx.app.inject({
      method: 'POST',
      url: `/api/environments/${envId}/secrets`,
      payload: { key: 'DELETEME', value: 'bye' },
    });
    const secretId = createRes.json().id;

    const res = await ctx.app.inject({
      method: 'DELETE',
      url: `/api/secrets/${secretId}`,
    });
    expect(res.statusCode).toBe(200);

    const listRes = await ctx.app.inject({
      method: 'GET',
      url: `/api/environments/${envId}/secrets`,
    });
    expect(listRes.json()).toHaveLength(0);
  });
});

describe('GET /api/search', () => {
  it('searches secrets by key across all projects', async () => {
    await ctx.app.inject({
      method: 'POST',
      url: `/api/environments/${envId}/secrets`,
      payload: { key: 'STRIPE_API_KEY', value: 'sk_test_123' },
    });
    await ctx.app.inject({
      method: 'POST',
      url: `/api/environments/${envId}/secrets`,
      payload: { key: 'DATABASE_URL', value: 'postgres://...' },
    });

    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/search?q=stripe',
    });
    const results = res.json();
    expect(results).toHaveLength(1);
    expect(results[0].key).toBe('STRIPE_API_KEY');
    expect(results[0].projectName).toBe('SecretTest');
    expect(results[0].environmentName).toBeTruthy();
  });
});

describe('GET /api/stats', () => {
  it('returns dashboard statistics', async () => {
    await ctx.app.inject({
      method: 'POST',
      url: `/api/environments/${envId}/secrets`,
      payload: { key: 'KEY1', value: 'v1' },
    });

    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/stats',
    });
    expect(res.statusCode).toBe(200);
    const stats = res.json();
    expect(stats.projectCount).toBe(1);
    expect(stats.secretCount).toBe(1);
    expect(stats.environmentCount).toBe(3);
  });
});
