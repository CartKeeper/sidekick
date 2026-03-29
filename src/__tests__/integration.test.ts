// src/__tests__/integration.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import { createTestApp, type TestContext } from './helpers/server.js';

let ctx: TestContext;

afterEach(() => {
  ctx?.cleanup();
});

describe('full vault workflow', () => {
  it('setup → project → secrets → export → password change → verify', async () => {
    ctx = await createTestApp();
    const { app } = ctx;

    // 1. Check status — needs setup
    const status1 = await app.inject({ method: 'GET', url: '/api/auth/status' });
    expect(status1.json().needsSetup).toBe(true);

    // 2. Setup
    await app.inject({
      method: 'POST',
      url: '/api/auth/setup',
      payload: { password: 'master-123', enableKeychain: false },
    });

    // 3. Unlock
    await app.inject({
      method: 'POST',
      url: '/api/auth/unlock',
      payload: { password: 'master-123' },
    });

    // 4. Create project
    const projRes = await app.inject({
      method: 'POST',
      url: '/api/projects',
      payload: {
        name: 'MyStartup',
        path: '/Users/me/startup',
        stack: ['Next.js', 'Supabase'],
        start_commands: [
          { name: 'Frontend', command: 'npm run dev', path: '/Users/me/startup' },
        ],
        dev_url: 'http://localhost:3000',
      },
    });
    const project = projRes.json();
    expect(project.name).toBe('MyStartup');
    expect(project.stack).toEqual(['Next.js', 'Supabase']);

    // 5. Get environments
    const envsRes = await app.inject({
      method: 'GET',
      url: `/api/projects/${project.id}/environments`,
    });
    const devEnv = envsRes.json().find((e: any) => e.slug === 'dev');

    // 6. Add secrets
    await app.inject({
      method: 'POST',
      url: `/api/environments/${devEnv.id}/secrets`,
      payload: { key: 'SUPABASE_URL', value: 'https://abc.supabase.co' },
    });
    await app.inject({
      method: 'POST',
      url: `/api/environments/${devEnv.id}/secrets`,
      payload: { key: 'SUPABASE_ANON_KEY', value: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9' },
    });
    await app.inject({
      method: 'POST',
      url: `/api/environments/${devEnv.id}/secrets`,
      payload: { key: 'STRIPE_SECRET_KEY', value: 'sk_test_abc123' },
    });

    // 7. Export as dotenv
    const exportRes = await app.inject({
      method: 'GET',
      url: `/api/projects/${project.id}/export?env=dev&format=dotenv`,
    });
    expect(exportRes.body).toContain('SUPABASE_URL="https://abc.supabase.co"');
    expect(exportRes.body).toContain('STRIPE_SECRET_KEY="sk_test_abc123"');

    // 8. Search
    const searchRes = await app.inject({
      method: 'GET',
      url: '/api/search?q=supabase',
    });
    expect(searchRes.json()).toHaveLength(2);

    // 9. Stats
    const statsRes = await app.inject({ method: 'GET', url: '/api/stats' });
    expect(statsRes.json().projectCount).toBe(1);
    expect(statsRes.json().secretCount).toBe(3);

    // 10. Change password
    await app.inject({
      method: 'POST',
      url: '/api/auth/change-password',
      payload: { currentPassword: 'master-123', newPassword: 'new-master-456' },
    });

    // 11. Lock
    await app.inject({ method: 'POST', url: '/api/auth/lock' });

    // 12. Unlock with new password
    const unlock2 = await app.inject({
      method: 'POST',
      url: '/api/auth/unlock',
      payload: { password: 'new-master-456' },
    });
    expect(unlock2.statusCode).toBe(200);

    // 13. Verify secrets survived re-encryption
    const secretsRes = await app.inject({
      method: 'GET',
      url: `/api/environments/${devEnv.id}/secrets?reveal=true`,
    });
    const secrets = secretsRes.json();
    expect(secrets).toHaveLength(3);
    const stripeSecret = secrets.find((s: any) => s.key === 'STRIPE_SECRET_KEY');
    expect(stripeSecret.value).toBe('sk_test_abc123');

    // 14. Get full project detail
    const detailRes = await app.inject({
      method: 'GET',
      url: `/api/projects/${project.id}`,
    });
    const detail = detailRes.json();
    expect(detail.environments).toHaveLength(3);
    expect(detail.start_commands).toHaveLength(1);
    expect(detail.start_commands[0].command).toBe('npm run dev');
  });
});
