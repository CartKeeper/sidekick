// src/__tests__/server/projects.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestApp, setupAndUnlock, type TestContext } from '../helpers/server.js';

let ctx: TestContext;

beforeEach(async () => {
  ctx = await createTestApp();
  await setupAndUnlock(ctx.app);
});

afterEach(() => {
  ctx.cleanup();
});

describe('POST /api/projects', () => {
  it('creates a project with default environments', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/projects',
      payload: { name: 'MyApp', description: 'Test app', path: '/Users/me/myapp' },
    });
    expect(res.statusCode).toBe(200);
    const project = res.json();
    expect(project.name).toBe('MyApp');
    expect(project.description).toBe('Test app');
    expect(project.path).toBe('/Users/me/myapp');
    expect(project.id).toBeTruthy();

    const envsRes = await ctx.app.inject({
      method: 'GET',
      url: `/api/projects/${project.id}/environments`,
    });
    const envs = envsRes.json();
    expect(envs).toHaveLength(3);
    const slugs = envs.map((e: any) => e.slug);
    expect(slugs).toContain('dev');
    expect(slugs).toContain('staging');
    expect(slugs).toContain('prod');
  });

  it('rejects duplicate project names', async () => {
    await ctx.app.inject({
      method: 'POST',
      url: '/api/projects',
      payload: { name: 'Duplicate' },
    });
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/projects',
      payload: { name: 'Duplicate' },
    });
    expect(res.statusCode).toBe(409);
  });
});

describe('GET /api/projects', () => {
  it('returns all non-archived projects with counts', async () => {
    await ctx.app.inject({
      method: 'POST',
      url: '/api/projects',
      payload: { name: 'App1' },
    });
    await ctx.app.inject({
      method: 'POST',
      url: '/api/projects',
      payload: { name: 'App2' },
    });

    const res = await ctx.app.inject({ method: 'GET', url: '/api/projects' });
    expect(res.statusCode).toBe(200);
    const projects = res.json();
    expect(projects).toHaveLength(2);
    expect(projects[0]).toHaveProperty('environmentCount');
    expect(projects[0]).toHaveProperty('secretCount');
  });

  it('excludes archived projects', async () => {
    const createRes = await ctx.app.inject({
      method: 'POST',
      url: '/api/projects',
      payload: { name: 'ToArchive' },
    });
    const project = createRes.json();

    await ctx.app.inject({
      method: 'DELETE',
      url: `/api/projects/${project.id}`,
    });

    const res = await ctx.app.inject({ method: 'GET', url: '/api/projects' });
    expect(res.json()).toHaveLength(0);
  });
});

describe('GET /api/projects/:id', () => {
  it('returns a project with environments', async () => {
    const createRes = await ctx.app.inject({
      method: 'POST',
      url: '/api/projects',
      payload: { name: 'Detail', stack: ['React', 'Node'] },
    });
    const project = createRes.json();

    const res = await ctx.app.inject({
      method: 'GET',
      url: `/api/projects/${project.id}`,
    });
    expect(res.statusCode).toBe(200);
    const detail = res.json();
    expect(detail.name).toBe('Detail');
    expect(detail.stack).toEqual(['React', 'Node']);
    expect(detail.environments).toHaveLength(3);
  });

  it('returns 404 for missing project', async () => {
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/projects/nonexistent',
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('PUT /api/projects/:id', () => {
  it('updates project fields', async () => {
    const createRes = await ctx.app.inject({
      method: 'POST',
      url: '/api/projects',
      payload: { name: 'Before' },
    });
    const project = createRes.json();

    const res = await ctx.app.inject({
      method: 'PUT',
      url: `/api/projects/${project.id}`,
      payload: { name: 'After', color: '#ff0000', dev_url: 'http://localhost:3000' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().name).toBe('After');
    expect(res.json().color).toBe('#ff0000');
    expect(res.json().dev_url).toBe('http://localhost:3000');
  });
});

describe('DELETE /api/projects/:id', () => {
  it('soft-deletes by setting archived=1', async () => {
    const createRes = await ctx.app.inject({
      method: 'POST',
      url: '/api/projects',
      payload: { name: 'SoftDel' },
    });
    const project = createRes.json();

    const res = await ctx.app.inject({
      method: 'DELETE',
      url: `/api/projects/${project.id}`,
    });
    expect(res.statusCode).toBe(200);

    const listRes = await ctx.app.inject({ method: 'GET', url: '/api/projects' });
    expect(listRes.json()).toHaveLength(0);
  });
});

describe('POST /api/projects/:projectId/environments', () => {
  it('creates a new environment', async () => {
    const createRes = await ctx.app.inject({
      method: 'POST',
      url: '/api/projects',
      payload: { name: 'EnvTest' },
    });
    const project = createRes.json();

    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/projects/${project.id}/environments`,
      payload: { name: 'QA', slug: 'qa' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().name).toBe('QA');
    expect(res.json().slug).toBe('qa');
  });
});

describe('GET /api/projects/:projectId/environments', () => {
  it('lists environments with secret counts', async () => {
    const createRes = await ctx.app.inject({
      method: 'POST',
      url: '/api/projects',
      payload: { name: 'ListEnvs' },
    });
    const project = createRes.json();

    const res = await ctx.app.inject({
      method: 'GET',
      url: `/api/projects/${project.id}/environments`,
    });
    expect(res.statusCode).toBe(200);
    const envs = res.json();
    expect(envs).toHaveLength(3);
    expect(envs[0]).toHaveProperty('secretCount');
  });
});

describe('DELETE /api/environments/:id', () => {
  it('deletes an environment', async () => {
    const createRes = await ctx.app.inject({
      method: 'POST',
      url: '/api/projects',
      payload: { name: 'DelEnv' },
    });
    const project = createRes.json();

    const envRes = await ctx.app.inject({
      method: 'POST',
      url: `/api/projects/${project.id}/environments`,
      payload: { name: 'QA', slug: 'qa' },
    });
    const env = envRes.json();

    const res = await ctx.app.inject({
      method: 'DELETE',
      url: `/api/environments/${env.id}`,
    });
    expect(res.statusCode).toBe(200);

    const listRes = await ctx.app.inject({
      method: 'GET',
      url: `/api/projects/${project.id}/environments`,
    });
    expect(listRes.json()).toHaveLength(3);
  });

  it('prevents deleting the last environment', async () => {
    const createRes = await ctx.app.inject({
      method: 'POST',
      url: '/api/projects',
      payload: { name: 'LastEnv' },
    });
    const project = createRes.json();

    const envsRes = await ctx.app.inject({
      method: 'GET',
      url: `/api/projects/${project.id}/environments`,
    });
    const envs = envsRes.json();

    await ctx.app.inject({ method: 'DELETE', url: `/api/environments/${envs[0].id}` });
    await ctx.app.inject({ method: 'DELETE', url: `/api/environments/${envs[1].id}` });

    const res = await ctx.app.inject({
      method: 'DELETE',
      url: `/api/environments/${envs[2].id}`,
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('vault locked guard', () => {
  it('rejects project creation when vault is locked', async () => {
    await ctx.app.inject({ method: 'POST', url: '/api/auth/lock' });
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/projects',
      payload: { name: 'Locked' },
    });
    expect(res.statusCode).toBe(403);
  });
});
