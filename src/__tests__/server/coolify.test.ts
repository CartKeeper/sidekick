import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createTestApp, setupAndUnlock, type TestContext } from '../helpers/server.js';
import { syncProject } from '../../server/routes/coolify.js';
import { encrypt } from '../../core/crypto.js';

let ctx: TestContext;
let projectId: string;
let envId: string;

/** Directly seed encrypted coolify config onto a project row for sync tests. */
function connectCoolify(ctx: TestContext, projectId: string, overrides: Record<string, unknown> = {}) {
  const vaultKey = ctx.app.vault.requireKey();
  const tok = encrypt('cool_tok', vaultKey);
  ctx.app.db.prepare(
    `UPDATE projects SET
      coolify_instance_url = ?, coolify_api_token_encrypted = ?, coolify_api_token_iv = ?, coolify_api_token_auth_tag = ?,
      coolify_resource_type = 'service', coolify_resource_uuid = 'svc-1', coolify_resource_name = 'db',
      coolify_target_environment = ?, coolify_sync_mode = ?
      WHERE id = ?`
  ).run(
    'https://coolify.example.com',
    tok.ciphertext, tok.iv, tok.authTag,
    (overrides.targetEnvironment as string) ?? 'dev',
    (overrides.syncMode as string) ?? 'merge',
    projectId
  );
}

function stubEnvs(pairs: Array<{ key: string; value?: string; real_value?: string }>) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true, status: 200, json: async () => pairs, text: async () => '',
  }));
}

beforeEach(async () => {
  ctx = await createTestApp();
  await setupAndUnlock(ctx.app);
  const proj = await ctx.app.inject({ method: 'POST', url: '/api/projects', payload: { name: 'CoolProj' } });
  projectId = proj.json().id;
  const envs = await ctx.app.inject({ method: 'GET', url: `/api/projects/${projectId}/environments` });
  envId = envs.json()[0].id; // default 'dev' env
});

afterEach(() => { vi.unstubAllGlobals(); ctx.cleanup(); });

describe('syncProject', () => {
  it('writes resolved values (real_value) tagged source=coolify', async () => {
    connectCoolify(ctx, projectId);
    stubEnvs([{ key: 'SUPABASE_ANON_KEY', value: '${SERVICE_ANON}', real_value: 'resolved-anon' }]);
    const vaultKey = ctx.app.vault.requireKey();

    const result = await syncProject(ctx.app.db, vaultKey, projectId);
    expect(result.updated).toBe(1);

    const row = ctx.app.db.prepare('SELECT * FROM secrets WHERE environment_id = ? AND key = ?')
      .get(envId, 'SUPABASE_ANON_KEY') as any;
    expect(row.source).toBe('coolify');
    expect(row.type).toBe('api_key');

    const reveal = await ctx.app.inject({ method: 'GET', url: `/api/environments/${envId}/secrets?reveal=true` });
    const anon = reveal.json().find((s: any) => s.key === 'SUPABASE_ANON_KEY');
    expect(anon.value).toBe('resolved-anon');
  });

  it('skips empty values and stamps coolify_last_sync', async () => {
    connectCoolify(ctx, projectId);
    stubEnvs([{ key: 'EMPTY', value: '' }, { key: 'REAL', value: 'v' }]);
    const vaultKey = ctx.app.vault.requireKey();
    const result = await syncProject(ctx.app.db, vaultKey, projectId);
    expect(result.skippedEmpty).toBe(1);
    expect(result.updated).toBe(1);
    const proj = ctx.app.db.prepare('SELECT coolify_last_sync FROM projects WHERE id = ?').get(projectId) as any;
    expect(proj.coolify_last_sync).toBeTruthy();
  });

  it('merge mode never overwrites a source=manual secret (records conflict)', async () => {
    connectCoolify(ctx, projectId, { syncMode: 'merge' });
    await ctx.app.inject({ method: 'POST', url: `/api/environments/${envId}/secrets`, payload: { key: 'KEEP', value: 'mine' } });
    stubEnvs([{ key: 'KEEP', value: 'theirs' }]);
    const vaultKey = ctx.app.vault.requireKey();
    const result = await syncProject(ctx.app.db, vaultKey, projectId);
    expect(result.conflicts).toContain('KEEP');
    const reveal = await ctx.app.inject({ method: 'GET', url: `/api/environments/${envId}/secrets?reveal=true` });
    expect(reveal.json().find((s: any) => s.key === 'KEEP').value).toBe('mine');
  });

  it('overwrite mode removes stale coolify keys but not manual keys', async () => {
    connectCoolify(ctx, projectId, { syncMode: 'overwrite' });
    const vaultKey = ctx.app.vault.requireKey();
    // First sync writes STALE + LIVE as coolify-managed.
    stubEnvs([{ key: 'STALE', value: 'x' }, { key: 'LIVE', value: '1' }]);
    await syncProject(ctx.app.db, vaultKey, projectId);
    // Add a manual secret that must survive.
    await ctx.app.inject({ method: 'POST', url: `/api/environments/${envId}/secrets`, payload: { key: 'MINE', value: 'safe' } });
    // Second sync no longer includes STALE.
    stubEnvs([{ key: 'LIVE', value: '2' }]);
    await syncProject(ctx.app.db, vaultKey, projectId);

    const keys = (ctx.app.db.prepare('SELECT key FROM secrets WHERE environment_id = ?').all(envId) as any[]).map((r) => r.key);
    expect(keys).toContain('LIVE');
    expect(keys).toContain('MINE');
    expect(keys).not.toContain('STALE');
  });

  it('overwrite mode never overwrites a source=manual secret (records conflict)', async () => {
    connectCoolify(ctx, projectId, { syncMode: 'overwrite' });
    await ctx.app.inject({ method: 'POST', url: `/api/environments/${envId}/secrets`, payload: { key: 'SHARED', value: 'mine' } });
    stubEnvs([{ key: 'SHARED', value: 'theirs' }]);
    const vaultKey = ctx.app.vault.requireKey();
    const result = await syncProject(ctx.app.db, vaultKey, projectId);
    expect(result.conflicts).toContain('SHARED');
    const reveal = await ctx.app.inject({ method: 'GET', url: `/api/environments/${envId}/secrets?reveal=true` });
    expect(reveal.json().find((s: any) => s.key === 'SHARED').value).toBe('mine');
  });
});

describe('coolify HTTP routes', () => {
  it('POST /coolify/connect validates, persists, and runs an initial sync', async () => {
    // /applications + /services (resources not used here) then /services/:uuid/envs
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: async () => [{ key: 'DB_PASSWORD', value: 'pw' }],
      text: async () => '',
    }));

    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/coolify/connect/${projectId}`,
      payload: {
        instanceUrl: 'https://coolify.example.com',
        token: 'cool_tok',
        resourceType: 'service',
        resourceUuid: 'svc-1',
        resourceName: 'db',
        targetEnvironment: 'dev',
        syncMode: 'merge',
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().sync.updated).toBe(1);

    // Token is stored encrypted, not plaintext.
    const row = ctx.app.db.prepare('SELECT coolify_api_token_encrypted FROM projects WHERE id = ?').get(projectId) as any;
    expect(row.coolify_api_token_encrypted).toBeTruthy();
    expect(row.coolify_api_token_encrypted).not.toContain('cool_tok');
  });

  it('GET /coolify/status reports connected after connect', async () => {
    connectCoolify(ctx, projectId);
    const res = await ctx.app.inject({ method: 'GET', url: `/api/coolify/status/${projectId}` });
    expect(res.statusCode).toBe(200);
    expect(res.json().connected).toBe(true);
    expect(res.json().resourceName).toBe('db');
  });

  it('POST /coolify/disconnect clears config and demotes secrets to manual', async () => {
    connectCoolify(ctx, projectId);
    stubEnvs([{ key: 'FROM_COOLIFY', value: 'v' }]);
    await ctx.app.inject({ method: 'POST', url: `/api/coolify/sync/${projectId}` });

    const res = await ctx.app.inject({ method: 'POST', url: `/api/coolify/disconnect/${projectId}` });
    expect(res.statusCode).toBe(200);

    const proj = ctx.app.db.prepare('SELECT coolify_instance_url, coolify_api_token_encrypted FROM projects WHERE id = ?').get(projectId) as any;
    expect(proj.coolify_api_token_encrypted).toBeNull();
    const sec = ctx.app.db.prepare('SELECT source FROM secrets WHERE environment_id = ? AND key = ?').get(envId, 'FROM_COOLIFY') as any;
    expect(sec.source).toBe('manual');
  });

  it('routes are guarded by the vault lock', async () => {
    await ctx.app.inject({ method: 'POST', url: '/api/auth/lock' });
    const res = await ctx.app.inject({ method: 'GET', url: `/api/coolify/status/${projectId}` });
    expect(res.statusCode).toBe(403);
  });

  it('POST /coolify/sync returns 400 (not 500) when the stored token cannot be decrypted', async () => {
    connectCoolify(ctx, projectId);
    // Corrupt the stored ciphertext so decrypt() throws (simulates a rotated/stale vault key).
    ctx.app.db.prepare(
      "UPDATE projects SET coolify_api_token_encrypted = 'deadbeef' || coolify_api_token_encrypted WHERE id = ?"
    ).run(projectId);

    const res = await ctx.app.inject({ method: 'POST', url: `/api/coolify/sync/${projectId}` });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/vault key may have changed/i);
  });
});
