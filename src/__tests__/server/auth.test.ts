// src/__tests__/server/auth.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestApp, type TestContext } from '../helpers/server.js';
import { encrypt, decrypt } from '../../core/crypto.js';

let ctx: TestContext;

beforeEach(async () => {
  ctx = await createTestApp();
});

afterEach(() => {
  ctx.cleanup();
});

describe('GET /api/auth/status', () => {
  it('returns needsSetup:true on fresh database', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/api/auth/status' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.needsSetup).toBe(true);
    expect(body.isLocked).toBe(true);
  });
});

describe('POST /api/auth/setup', () => {
  it('sets up the vault with a master password', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/setup',
      payload: { password: 'master-pw-123', enableKeychain: false },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);

    const status = await ctx.app.inject({ method: 'GET', url: '/api/auth/status' });
    expect(status.json().needsSetup).toBe(false);
  });

  it('rejects setup if already set up', async () => {
    await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/setup',
      payload: { password: 'pw1', enableKeychain: false },
    });
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/setup',
      payload: { password: 'pw2', enableKeychain: false },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('POST /api/auth/unlock', () => {
  it('unlocks the vault with correct password', async () => {
    await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/setup',
      payload: { password: 'correct-pw', enableKeychain: false },
    });
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/unlock',
      payload: { password: 'correct-pw' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);

    const status = await ctx.app.inject({ method: 'GET', url: '/api/auth/status' });
    expect(status.json().isLocked).toBe(false);
  });

  it('rejects wrong password', async () => {
    await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/setup',
      payload: { password: 'correct', enableKeychain: false },
    });
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/unlock',
      payload: { password: 'wrong' },
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('POST /api/auth/lock', () => {
  it('locks the vault', async () => {
    await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/setup',
      payload: { password: 'pw', enableKeychain: false },
    });
    await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/unlock',
      payload: { password: 'pw' },
    });
    const res = await ctx.app.inject({ method: 'POST', url: '/api/auth/lock' });
    expect(res.statusCode).toBe(200);

    const status = await ctx.app.inject({ method: 'GET', url: '/api/auth/status' });
    expect(status.json().isLocked).toBe(true);
  });
});

describe('POST /api/auth/change-password', () => {
  it('changes the master password and re-encrypts all secrets', async () => {
    await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/setup',
      payload: { password: 'old-pw', enableKeychain: false },
    });
    await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/unlock',
      payload: { password: 'old-pw' },
    });

    // Create a project + environment + secret to verify re-encryption
    const projRes = await ctx.app.inject({
      method: 'POST',
      url: '/api/projects',
      payload: { name: 'TestProject' },
    });
    const project = projRes.json();
    const envsRes = await ctx.app.inject({
      method: 'GET',
      url: `/api/projects/${project.id}/environments`,
    });
    const env = envsRes.json()[0];
    await ctx.app.inject({
      method: 'POST',
      url: `/api/environments/${env.id}/secrets`,
      payload: { key: 'API_KEY', value: 'secret-123' },
    });

    // Change password
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/change-password',
      payload: { currentPassword: 'old-pw', newPassword: 'new-pw' },
    });
    expect(res.statusCode).toBe(200);

    // Lock and re-unlock with new password
    await ctx.app.inject({ method: 'POST', url: '/api/auth/lock' });
    const unlockRes = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/unlock',
      payload: { password: 'new-pw' },
    });
    expect(unlockRes.statusCode).toBe(200);

    // Verify secret is still readable
    const secretsRes = await ctx.app.inject({
      method: 'GET',
      url: `/api/environments/${env.id}/secrets?reveal=true`,
    });
    const secrets = secretsRes.json();
    expect(secrets[0].value).toBe('secret-123');
  });

  it('re-encrypts the Supabase and Coolify connection tokens stored on projects', async () => {
    await ctx.app.inject({ method: 'POST', url: '/api/auth/setup', payload: { password: 'old-pw', enableKeychain: false } });
    await ctx.app.inject({ method: 'POST', url: '/api/auth/unlock', payload: { password: 'old-pw' } });
    const project = (await ctx.app.inject({ method: 'POST', url: '/api/projects', payload: { name: 'Connected' } })).json();

    const oldKey = ctx.app.vault.requireKey();
    const sb = encrypt('sb-token', oldKey);
    const cool = encrypt('cool-token', oldKey);
    const access = encrypt('access-secret', oldKey);
    ctx.app.db.prepare(
      `UPDATE projects SET
        supabase_token_encrypted = ?, supabase_token_iv = ?, supabase_token_auth_tag = ?,
        coolify_api_token_encrypted = ?, coolify_api_token_iv = ?, coolify_api_token_auth_tag = ?,
        coolify_cf_access_secret_encrypted = ?, coolify_cf_access_secret_iv = ?, coolify_cf_access_secret_auth_tag = ?
      WHERE id = ?`
    ).run(sb.ciphertext, sb.iv, sb.authTag, cool.ciphertext, cool.iv, cool.authTag,
      access.ciphertext, access.iv, access.authTag, project.id);

    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/change-password',
      payload: { currentPassword: 'old-pw', newPassword: 'new-pw' },
    });
    expect(res.statusCode).toBe(200);

    await ctx.app.inject({ method: 'POST', url: '/api/auth/lock' });
    await ctx.app.inject({ method: 'POST', url: '/api/auth/unlock', payload: { password: 'new-pw' } });
    const newKey = ctx.app.vault.requireKey();
    const row = ctx.app.db.prepare('SELECT * FROM projects WHERE id = ?').get(project.id) as any;
    const open = (prefix: string) => decrypt(
      { ciphertext: row[`${prefix}_encrypted`], iv: row[`${prefix}_iv`], authTag: row[`${prefix}_auth_tag`] },
      newKey
    );
    expect(open('supabase_token')).toBe('sb-token');
    expect(open('coolify_api_token')).toBe('cool-token');
    expect(open('coolify_cf_access_secret')).toBe('access-secret');
  });

  it('rejects if current password is wrong', async () => {
    await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/setup',
      payload: { password: 'pw', enableKeychain: false },
    });
    await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/unlock',
      payload: { password: 'pw' },
    });

    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/change-password',
      payload: { currentPassword: 'wrong', newPassword: 'new' },
    });
    expect(res.statusCode).toBe(401);
  });
});
