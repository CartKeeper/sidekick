// src/__tests__/server/process.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestApp, setupAndUnlock, type TestContext } from '../helpers/server.js';

let ctx: TestContext;

beforeEach(async () => {
  ctx = await createTestApp();
  await setupAndUnlock(ctx.app);
});

afterEach(async () => {
  // Stop all processes before cleanup
  const status = await ctx.app.inject({ method: 'GET', url: '/api/process/status' });
  const procs = status.json();
  for (const proc of procs) {
    if (proc.status === 'running') {
      await ctx.app.inject({ method: 'POST', url: `/api/process/kill/${proc.id}` });
    }
  }
  await new Promise((r) => setTimeout(r, 300));
  ctx.cleanup();
});

describe('POST /api/process/launch/:projectId', () => {
  it('launches a project with start commands', async () => {
    // Create project with a start command
    const projRes = await ctx.app.inject({
      method: 'POST',
      url: '/api/projects',
      payload: {
        name: 'TestApp',
        path: '/tmp',
        start_commands: [{ name: 'server', command: 'sleep 30' }],
      },
    });
    const project = projRes.json();

    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/process/launch/${project.id}`,
      payload: {},
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.processes).toHaveLength(1);
    expect(body.processes[0].status).toBe('running');
    expect(body.processes[0].projectId).toBe(project.id);
  });

  it('rejects launch if no start commands', async () => {
    const projRes = await ctx.app.inject({
      method: 'POST',
      url: '/api/projects',
      payload: { name: 'NoCommands' },
    });
    const project = projRes.json();

    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/process/launch/${project.id}`,
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects launch if already running', async () => {
    const projRes = await ctx.app.inject({
      method: 'POST',
      url: '/api/projects',
      payload: {
        name: 'Running',
        path: '/tmp',
        start_commands: [{ name: 'srv', command: 'sleep 30' }],
      },
    });
    const project = projRes.json();

    await ctx.app.inject({
      method: 'POST',
      url: `/api/process/launch/${project.id}`,
      payload: {},
    });

    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/process/launch/${project.id}`,
      payload: {},
    });
    expect(res.statusCode).toBe(409);
  });

  it('injects secrets from the default environment', async () => {
    const projRes = await ctx.app.inject({
      method: 'POST',
      url: '/api/projects',
      payload: {
        name: 'WithSecrets',
        path: '/tmp',
        start_commands: [{ name: 'env', command: 'echo $TEST_SECRET && sleep 5' }],
      },
    });
    const project = projRes.json();

    // Add a secret to the dev environment
    const envsRes = await ctx.app.inject({
      method: 'GET',
      url: `/api/projects/${project.id}/environments`,
    });
    const devEnv = envsRes.json().find((e: any) => e.slug === 'dev');

    await ctx.app.inject({
      method: 'POST',
      url: `/api/environments/${devEnv.id}/secrets`,
      payload: { key: 'TEST_SECRET', value: 'injected-value-123' },
    });

    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/process/launch/${project.id}`,
      payload: {},
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().processes).toHaveLength(1);
  });
});

describe('POST /api/process/stop/:projectId', () => {
  it('stops a running project', async () => {
    const projRes = await ctx.app.inject({
      method: 'POST',
      url: '/api/projects',
      payload: {
        name: 'Stoppable',
        path: '/tmp',
        start_commands: [{ name: 'srv', command: 'sleep 60' }],
      },
    });
    const project = projRes.json();

    await ctx.app.inject({
      method: 'POST',
      url: `/api/process/launch/${project.id}`,
      payload: {},
    });

    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/process/stop/${project.id}`,
    });
    expect(res.statusCode).toBe(200);

    // Verify stopped
    await new Promise((r) => setTimeout(r, 500));
    const statusRes = await ctx.app.inject({
      method: 'GET',
      url: `/api/process/status/${project.id}`,
    });
    expect(statusRes.json().running).toBe(false);
  });
});

describe('GET /api/process/status', () => {
  it('returns all running processes', async () => {
    const projRes = await ctx.app.inject({
      method: 'POST',
      url: '/api/projects',
      payload: {
        name: 'StatusCheck',
        path: '/tmp',
        start_commands: [{ name: 'srv', command: 'sleep 60' }],
      },
    });
    const project = projRes.json();

    await ctx.app.inject({
      method: 'POST',
      url: `/api/process/launch/${project.id}`,
      payload: {},
    });

    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/process/status',
    });
    expect(res.statusCode).toBe(200);
    const procs = res.json();
    expect(procs.length).toBeGreaterThanOrEqual(1);
    expect(procs[0].status).toBe('running');
  });
});
