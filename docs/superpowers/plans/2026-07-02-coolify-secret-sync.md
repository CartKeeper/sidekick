# Coolify Secret Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a manual, re-runnable "Connect Coolify" integration that pulls a self-hosted Coolify resource's environment variables into a SideKick project's secrets — the Coolify twin of the existing Supabase Cloud sync.

**Architecture:** Mirror the Supabase feature exactly. Sync logic lives in a new `src/server/routes/coolify.ts` running in the Fastify server child process; it reuses the AES-256-GCM helpers in `src/core/crypto.ts` and the `secrets.source` column (tagged `'coolify'`). New `coolify_*` columns are added to the `projects` table via `ALTER TABLE` migrations in `src/core/db.ts`. The React frontend (`SecretsTab.tsx`) triggers everything over HTTP via `api.coolify.*` in `src/web/src/api/client.ts`. No Electron-main or MCP changes.

**Tech Stack:** TypeScript (ESM, `.js` import specifiers), Fastify, better-sqlite3, Node `fetch`, React + Tailwind v4 (CSS-first tokens), Vitest.

## Global Constraints

- **Sync is manual only.** No auto-sync on unlock; do NOT touch `src/server/routes/auth.ts`, and do NOT add a `autoSyncCoolify`.
- **Read-only against Coolify.** Only HTTP `GET`. Never write back to Coolify.
- **Encrypt at rest** the Coolify API token and the Cloudflare Access secret using `encrypt()`/`decrypt()` from `src/core/crypto.ts` (AES-256-GCM). The CF Access *Client Id* is stored plaintext (it is an identifier, not a secret).
- **Prefer resolved values:** when reading a Coolify env object, use `real_value` when non-empty, else `value`, else `""`. Never store the literal `${...}` reference.
- **Never log secret values.** Log key names + counts only.
- **`source` tagging:** synced secrets use `source = 'coolify'`. Merge mode never deletes; overwrite mode only ever removes `source='coolify'` secrets in the target env, never `source='manual'`.
- **Default `sync_mode = 'merge'`, default `target_environment = 'prod'`.**
- **ESM imports** within `src/` use `.js` specifiers (e.g. `import { encrypt } from '../../core/crypto.js'`), matching the existing codebase.
- **Timezone:** any timestamp shown in the UI renders in `America/New_York`, 12-hour AM/PM (copy the existing Supabase `toLocaleString` call).
- **Help icon:** the Coolify connector UI must include a bare `?` help icon (lucide `HelpCircle`, no filled background/pill) with contextual guidance, per the mandatory per-page help-icon rule.

---

### Task 1: Add `coolify_*` columns to the `projects` table

**Files:**
- Modify: `src/core/db.ts:116-125` (add migrations after the `supabase_env_styles` block, before the secrets `source` migration)
- Test: `src/__tests__/core/db.test.ts` (add a test to the existing file)

**Interfaces:**
- Consumes: nothing.
- Produces: `projects` rows carry these nullable columns — `coolify_instance_url` (TEXT DEFAULT ''), `coolify_api_token_encrypted`/`coolify_api_token_iv`/`coolify_api_token_auth_tag` (TEXT DEFAULT NULL), `coolify_cf_access_client_id` (TEXT DEFAULT NULL), `coolify_cf_access_secret_encrypted`/`coolify_cf_access_secret_iv`/`coolify_cf_access_secret_auth_tag` (TEXT DEFAULT NULL), `coolify_resource_type` (TEXT DEFAULT ''), `coolify_resource_uuid` (TEXT DEFAULT ''), `coolify_resource_name` (TEXT DEFAULT ''), `coolify_target_environment` (TEXT DEFAULT 'prod'), `coolify_sync_mode` (TEXT DEFAULT 'merge'), `coolify_last_sync` (TEXT DEFAULT NULL).

- [ ] **Step 1: Write the failing test**

Add to `src/__tests__/core/db.test.ts` (inside the existing top-level `describe`, or add a new one):

```ts
import { getDb, closeDb } from '../../core/db.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('coolify columns migration', () => {
  it('adds all coolify_* columns to projects', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sk-coolify-'));
    const dbPath = join(dir, 'm.db');
    const db = getDb(dbPath);
    const cols = new Set(
      (db.prepare("PRAGMA table_info(projects)").all() as { name: string }[]).map((c) => c.name)
    );
    for (const c of [
      'coolify_instance_url',
      'coolify_api_token_encrypted', 'coolify_api_token_iv', 'coolify_api_token_auth_tag',
      'coolify_cf_access_client_id',
      'coolify_cf_access_secret_encrypted', 'coolify_cf_access_secret_iv', 'coolify_cf_access_secret_auth_tag',
      'coolify_resource_type', 'coolify_resource_uuid', 'coolify_resource_name',
      'coolify_target_environment', 'coolify_sync_mode', 'coolify_last_sync',
    ]) {
      expect(cols.has(c)).toBe(true);
    }
    closeDb(dbPath);
    rmSync(dir, { recursive: true, force: true });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/core/db.test.ts -t "coolify columns"`
Expected: FAIL — columns missing (`expect(false).toBe(true)`).

- [ ] **Step 3: Add the migrations**

In `src/core/db.ts`, immediately after the `supabase_env_styles` migration block (currently ending at line 118) and before the `// Secrets source column` comment (line 120), insert:

```ts
  // Coolify sync — mirror of the Supabase fields, for self-hosted stacks.
  if (!colNames.has('coolify_instance_url')) {
    db.exec("ALTER TABLE projects ADD COLUMN coolify_instance_url TEXT DEFAULT ''");
  }
  if (!colNames.has('coolify_api_token_encrypted')) {
    db.exec("ALTER TABLE projects ADD COLUMN coolify_api_token_encrypted TEXT DEFAULT NULL");
    db.exec("ALTER TABLE projects ADD COLUMN coolify_api_token_iv TEXT DEFAULT NULL");
    db.exec("ALTER TABLE projects ADD COLUMN coolify_api_token_auth_tag TEXT DEFAULT NULL");
  }
  if (!colNames.has('coolify_cf_access_client_id')) {
    db.exec("ALTER TABLE projects ADD COLUMN coolify_cf_access_client_id TEXT DEFAULT NULL");
    db.exec("ALTER TABLE projects ADD COLUMN coolify_cf_access_secret_encrypted TEXT DEFAULT NULL");
    db.exec("ALTER TABLE projects ADD COLUMN coolify_cf_access_secret_iv TEXT DEFAULT NULL");
    db.exec("ALTER TABLE projects ADD COLUMN coolify_cf_access_secret_auth_tag TEXT DEFAULT NULL");
  }
  if (!colNames.has('coolify_resource_type')) {
    db.exec("ALTER TABLE projects ADD COLUMN coolify_resource_type TEXT DEFAULT ''");
    db.exec("ALTER TABLE projects ADD COLUMN coolify_resource_uuid TEXT DEFAULT ''");
    db.exec("ALTER TABLE projects ADD COLUMN coolify_resource_name TEXT DEFAULT ''");
  }
  if (!colNames.has('coolify_target_environment')) {
    db.exec("ALTER TABLE projects ADD COLUMN coolify_target_environment TEXT DEFAULT 'prod'");
  }
  if (!colNames.has('coolify_sync_mode')) {
    db.exec("ALTER TABLE projects ADD COLUMN coolify_sync_mode TEXT DEFAULT 'merge'");
  }
  if (!colNames.has('coolify_last_sync')) {
    db.exec("ALTER TABLE projects ADD COLUMN coolify_last_sync TEXT DEFAULT NULL");
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/core/db.test.ts -t "coolify columns"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/db.ts src/__tests__/core/db.test.ts
git commit -m "feat(db): add coolify_* columns to projects table"
```

---

### Task 2: Coolify HTTP client (`coolifyFetch`, resource + env fetchers)

**Files:**
- Create: `src/server/routes/coolify.ts`
- Test: `src/__tests__/server/coolify-client.test.ts`

**Interfaces:**
- Consumes: nothing (pure module; `fetch` is global).
- Produces (exported):
  - `interface CoolifyCreds { instanceUrl: string; token: string; cfAccessId?: string; cfAccessSecret?: string }`
  - `interface CoolifyResource { type: 'service' | 'application'; uuid: string; name: string }`
  - `interface CoolifyEnv { key: string; value?: string; real_value?: string }`
  - `function normalizeInstanceUrl(url: string): string`
  - `function coolifyFetch<T>(creds: CoolifyCreds, path: string): Promise<T>`
  - `function listCoolifyResources(creds: CoolifyCreds): Promise<CoolifyResource[]>`
  - `function fetchCoolifyEnv(creds: CoolifyCreds, resourceType: 'service'|'application', uuid: string): Promise<Record<string,string>>`
  - `function detectType(key: string): string`

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/server/coolify-client.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  normalizeInstanceUrl,
  coolifyFetch,
  listCoolifyResources,
  fetchCoolifyEnv,
} from '../../server/routes/coolify.js';

const CREDS = { instanceUrl: 'https://coolify.example.com/', token: 'tok' };

function mockFetchOnce(body: unknown, init: { ok?: boolean; status?: number; text?: string } = {}) {
  const fn = vi.fn().mockResolvedValue({
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: async () => body,
    text: async () => init.text ?? JSON.stringify(body),
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

afterEach(() => vi.unstubAllGlobals());

describe('normalizeInstanceUrl', () => {
  it('strips trailing slashes and whitespace', () => {
    expect(normalizeInstanceUrl('  https://x.com/// ')).toBe('https://x.com');
  });
});

describe('coolifyFetch', () => {
  it('sends Bearer + Accept and hits /api/v1', async () => {
    const fn = mockFetchOnce([{ ok: 1 }]);
    await coolifyFetch(CREDS, '/services');
    expect(fn).toHaveBeenCalledWith(
      'https://coolify.example.com/api/v1/services',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer tok',
          Accept: 'application/json',
        }),
      })
    );
  });

  it('adds CF Access headers when provided', async () => {
    const fn = mockFetchOnce([]);
    await coolifyFetch({ ...CREDS, cfAccessId: 'id', cfAccessSecret: 'sec' }, '/services');
    const headers = fn.mock.calls[0][1].headers;
    expect(headers['CF-Access-Client-Id']).toBe('id');
    expect(headers['CF-Access-Client-Secret']).toBe('sec');
  });

  it('throws the friendly Cloudflare Access error on a 403 HTML login page', async () => {
    mockFetchOnce(null, { ok: false, status: 403, text: '<!DOCTYPE html><title>Cloudflare Access</title>' });
    await expect(coolifyFetch(CREDS, '/services')).rejects.toThrow(/Cloudflare Access/i);
  });

  it('throws a generic error on other non-2xx', async () => {
    mockFetchOnce(null, { ok: false, status: 500, text: 'boom' });
    await expect(coolifyFetch(CREDS, '/services')).rejects.toThrow(/500/);
  });
});

describe('listCoolifyResources', () => {
  it('merges services and applications with type tags', async () => {
    const fn = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => [{ uuid: 's1', name: 'db' }], text: async () => '' })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => [{ uuid: 'a1', name: 'site' }], text: async () => '' });
    vi.stubGlobal('fetch', fn);
    const out = await listCoolifyResources(CREDS);
    expect(out).toEqual([
      { type: 'service', uuid: 's1', name: 'db' },
      { type: 'application', uuid: 'a1', name: 'site' },
    ]);
  });
});

describe('fetchCoolifyEnv', () => {
  it('prefers real_value, falls back to value, skips empty keys', async () => {
    mockFetchOnce([
      { key: 'ANON', value: '${SERVICE_ANON}', real_value: 'resolved-anon' },
      { key: 'PLAIN', value: 'plain-val' },
      { key: 'EMPTY', value: '', real_value: '' },
      { value: 'no-key' },
    ]);
    const out = await fetchCoolifyEnv(CREDS, 'service', 's1');
    expect(out).toEqual({ ANON: 'resolved-anon', PLAIN: 'plain-val', EMPTY: '' });
  });

  it('uses the applications path for application resources', async () => {
    const fn = mockFetchOnce([]);
    await fetchCoolifyEnv(CREDS, 'application', 'a1');
    expect(fn.mock.calls[0][0]).toBe('https://coolify.example.com/api/v1/applications/a1/envs');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/server/coolify-client.test.ts`
Expected: FAIL — `Cannot find module '../../server/routes/coolify.js'`.

- [ ] **Step 3: Create the module**

Create `src/server/routes/coolify.ts`:

```ts
// src/server/routes/coolify.ts
import type { FastifyInstance } from 'fastify';
import { newId, logAudit } from '../../core/db.js';
import { encrypt, decrypt } from '../../core/crypto.js';

export interface CoolifyCreds {
  instanceUrl: string;
  token: string;
  cfAccessId?: string;
  cfAccessSecret?: string;
}

export interface CoolifyResource {
  type: 'service' | 'application';
  uuid: string;
  name: string;
}

export interface CoolifyEnv {
  key: string;
  value?: string;
  real_value?: string;
}

export interface CoolifySyncResult {
  synced: number;
  updated: number;
  unchanged: number;
  skippedEmpty: number;
  conflicts: string[];
  errors: string[];
}

/** Trim whitespace and strip trailing slashes so `${url}/api/v1` is always well-formed. */
export function normalizeInstanceUrl(url: string): string {
  return (url ?? '').trim().replace(/\/+$/, '');
}

/**
 * Single HTTP helper for the Coolify API. Bearer auth + optional Cloudflare
 * Access service-token headers. Detects the Access login-page interception and
 * throws a friendly, actionable error instead of a raw 401/403.
 */
export async function coolifyFetch<T>(creds: CoolifyCreds, path: string): Promise<T> {
  const base = normalizeInstanceUrl(creds.instanceUrl);
  const headers: Record<string, string> = {
    Authorization: `Bearer ${creds.token}`,
    Accept: 'application/json',
  };
  if (creds.cfAccessId && creds.cfAccessSecret) {
    headers['CF-Access-Client-Id'] = creds.cfAccessId;
    headers['CF-Access-Client-Secret'] = creds.cfAccessSecret;
  }

  const res = await fetch(`${base}/api/v1${path}`, { headers });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const looksLikeAccessLogin =
      (res.status === 401 || res.status === 403) &&
      /<html|<!doctype html|cloudflare access|cf-access/i.test(text);
    if (looksLikeAccessLogin) {
      throw new Error(
        'Coolify is behind Cloudflare Access — add a service token or an Access bypass for /api/*.'
      );
    }
    throw new Error(`Coolify ${path} → ${res.status} ${text.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

/** List selectable resources (services + applications) for the connect picker. */
export async function listCoolifyResources(creds: CoolifyCreds): Promise<CoolifyResource[]> {
  const [services, apps] = await Promise.all([
    coolifyFetch<any[]>(creds, '/services'),
    coolifyFetch<any[]>(creds, '/applications'),
  ]);
  return [
    ...(services ?? []).map((s) => ({ type: 'service' as const, uuid: s.uuid, name: s.name })),
    ...(apps ?? []).map((a) => ({ type: 'application' as const, uuid: a.uuid, name: a.name })),
  ];
}

/** Pull one resource's env vars as resolved key→value pairs. */
export async function fetchCoolifyEnv(
  creds: CoolifyCreds,
  resourceType: 'service' | 'application',
  uuid: string
): Promise<Record<string, string>> {
  const path =
    resourceType === 'service' ? `/services/${uuid}/envs` : `/applications/${uuid}/envs`;
  const envs = await coolifyFetch<CoolifyEnv[]>(creds, path);
  const out: Record<string, string> = {};
  for (const e of envs ?? []) {
    if (!e.key) continue;
    const v = (e.real_value && e.real_value.length ? e.real_value : e.value) ?? '';
    out[e.key] = v;
  }
  return out;
}

/** Classify a key so the UI shows the right badge (copied from the Supabase sync). */
export function detectType(key: string): string {
  const k = key.toUpperCase();
  if (k.includes('API_KEY') || k.includes('APIKEY') || k.includes('ANON_KEY')) return 'api_key';
  if (k.includes('SECRET') || k.includes('PRIVATE') || k.includes('SERVICE_ROLE')) return 'secret';
  if (k.includes('TOKEN') || k.includes('JWT')) return 'token';
  if (k.includes('PASSWORD') || k.includes('PASSWD')) return 'password';
  if (k.includes('URL') || k.includes('URI') || k.includes('DATABASE')) return 'connection';
  return 'generic';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/server/coolify-client.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/server/routes/coolify.ts src/__tests__/server/coolify-client.test.ts
git commit -m "feat(coolify): HTTP client with CF Access handling + env/resource fetchers"
```

---

### Task 3: `syncProject` — write Coolify env into secrets (merge/overwrite)

**Files:**
- Modify: `src/server/routes/coolify.ts` (append `credsFromProject` + `syncProject`)
- Test: `src/__tests__/server/coolify.test.ts` (new)

**Interfaces:**
- Consumes: `encrypt`/`decrypt` (crypto), `newId` (db), `fetchCoolifyEnv`/`detectType`/`CoolifyCreds`/`CoolifySyncResult` from Task 2, the `coolify_*` columns from Task 1.
- Produces (exported):
  - `function credsFromProject(project: any, vaultKey: Buffer): CoolifyCreds`
  - `function syncProject(db: any, vaultKey: Buffer, projectId: string): Promise<CoolifySyncResult>`

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/server/coolify.test.ts`:

```ts
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
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/server/coolify.test.ts`
Expected: FAIL — `syncProject` not exported / not a function.

- [ ] **Step 3: Append `credsFromProject` + `syncProject` to `src/server/routes/coolify.ts`**

Add at the end of `src/server/routes/coolify.ts`:

```ts
/** Rebuild decrypted Coolify creds from a project row. */
export function credsFromProject(project: any, vaultKey: Buffer): CoolifyCreds {
  const token = decrypt(
    {
      ciphertext: project.coolify_api_token_encrypted,
      iv: project.coolify_api_token_iv,
      authTag: project.coolify_api_token_auth_tag,
    },
    vaultKey
  );
  let cfAccessSecret: string | undefined;
  if (project.coolify_cf_access_secret_encrypted) {
    cfAccessSecret = decrypt(
      {
        ciphertext: project.coolify_cf_access_secret_encrypted,
        iv: project.coolify_cf_access_secret_iv,
        authTag: project.coolify_cf_access_secret_auth_tag,
      },
      vaultKey
    );
  }
  return {
    instanceUrl: project.coolify_instance_url,
    token,
    cfAccessId: project.coolify_cf_access_client_id || undefined,
    cfAccessSecret,
  };
}

/**
 * Pull the connected Coolify resource's env vars and upsert them into the
 * project's target environment as secrets tagged source='coolify'.
 * Manual secrets are never overwritten; overwrite mode only prunes stale
 * coolify-managed keys.
 */
export async function syncProject(
  db: any,
  vaultKey: Buffer,
  projectId: string
): Promise<CoolifySyncResult> {
  const result: CoolifySyncResult = {
    synced: 0, updated: 0, unchanged: 0, skippedEmpty: 0, conflicts: [], errors: [],
  };

  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId) as any;
  if (!project) {
    result.errors.push('Project not found');
    return result;
  }
  if (!project.coolify_instance_url || !project.coolify_api_token_encrypted || !project.coolify_resource_uuid) {
    result.errors.push('Project is not connected to Coolify');
    return result;
  }

  const targetSlug = project.coolify_target_environment || 'prod';
  const mode = project.coolify_sync_mode === 'overwrite' ? 'overwrite' : 'merge';

  // Resolve the target environment; fall back to the first env if the named one
  // does not exist so a sync never silently writes nothing.
  const env =
    (db.prepare('SELECT * FROM environments WHERE project_id = ? AND slug = ?').get(projectId, targetSlug) as any) ??
    (db.prepare('SELECT * FROM environments WHERE project_id = ? ORDER BY sort_order LIMIT 1').get(projectId) as any);
  if (!env) {
    result.errors.push(`No environment '${targetSlug}' found for project`);
    return result;
  }

  const creds = credsFromProject(project, vaultKey);
  let pairs: Record<string, string>;
  try {
    pairs = await fetchCoolifyEnv(creds, project.coolify_resource_type, project.coolify_resource_uuid);
  } catch (err: any) {
    result.errors.push(err.message);
    return result;
  }

  // Overwrite: prune coolify-managed keys in this env that are no longer present.
  if (mode === 'overwrite') {
    const incoming = new Set(Object.keys(pairs));
    const existing = db
      .prepare("SELECT id, key FROM secrets WHERE environment_id = ? AND source = 'coolify'")
      .all(env.id) as any[];
    for (const row of existing) {
      if (!incoming.has(row.key)) {
        db.prepare('DELETE FROM secrets WHERE id = ?').run(row.id);
      }
    }
  }

  for (const [key, value] of Object.entries(pairs)) {
    if (!value) {
      result.skippedEmpty++;
      continue;
    }
    const existing = db
      .prepare('SELECT id, value_encrypted, iv, auth_tag, source FROM secrets WHERE environment_id = ? AND key = ?')
      .get(env.id, key) as any;

    if (existing) {
      if (existing.source === 'manual') {
        if (!result.conflicts.includes(key)) result.conflicts.push(key);
        continue;
      }
      try {
        const current = decrypt(
          { ciphertext: existing.value_encrypted, iv: existing.iv, authTag: existing.auth_tag },
          vaultKey
        );
        if (current === value) {
          result.unchanged++;
          continue;
        }
      } catch {
        // Can't decrypt — fall through and overwrite.
      }
      const enc = encrypt(value, vaultKey);
      db.prepare(
        "UPDATE secrets SET value_encrypted = ?, iv = ?, auth_tag = ?, source = 'coolify', updated_at = datetime('now') WHERE id = ?"
      ).run(enc.ciphertext, enc.iv, enc.authTag, existing.id);
      result.updated++;
    } else {
      const enc = encrypt(value, vaultKey);
      db.prepare(
        "INSERT INTO secrets (id, environment_id, key, value_encrypted, iv, auth_tag, type, source) VALUES (?, ?, ?, ?, ?, ?, ?, 'coolify')"
      ).run(newId(), env.id, key, enc.ciphertext, enc.iv, enc.authTag, detectType(key));
      result.updated++;
    }
  }

  result.synced = result.updated + result.unchanged;
  db.prepare("UPDATE projects SET coolify_last_sync = datetime('now') WHERE id = ?").run(projectId);
  return result;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/server/coolify.test.ts`
Expected: PASS (all four cases).

- [ ] **Step 5: Commit**

```bash
git add src/server/routes/coolify.ts src/__tests__/server/coolify.test.ts
git commit -m "feat(coolify): syncProject writes resolved env into secrets (merge/overwrite)"
```

---

### Task 4: Route handlers + registration

**Files:**
- Modify: `src/server/routes/coolify.ts` (append `coolifyRoutes`)
- Modify: `src/server/index.ts:17` (import) and `:57` (register)
- Test: `src/__tests__/server/coolify.test.ts` (add a `describe` block for the HTTP routes)

**Interfaces:**
- Consumes: everything from Tasks 2–3; `app.db`, `app.vault`, `logAudit`.
- Produces (exported): `async function coolifyRoutes(app: FastifyInstance): Promise<void>` registering, under the `/api` prefix:
  - `POST /coolify/test` — Body `CoolifyCreds` → `{ success, count }`
  - `POST /coolify/resources` — Body `CoolifyCreds` → `CoolifyResource[]`
  - `POST /coolify/connect/:projectId` — Body `CoolifyCreds & { resourceType, resourceUuid, resourceName, targetEnvironment?, syncMode? }` → `{ success, resource, sync }`
  - `POST /coolify/sync/:projectId` → `CoolifySyncResult`
  - `GET /coolify/status/:projectId` → `{ connected, instanceUrl, resourceType, resourceName, targetEnvironment, syncMode, lastSync }`
  - `POST /coolify/disconnect/:projectId` → `{ success }`

- [ ] **Step 1: Write the failing test**

Append to `src/__tests__/server/coolify.test.ts`:

```ts
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
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/server/coolify.test.ts -t "coolify HTTP routes"`
Expected: FAIL — routes 404 (not registered).

- [ ] **Step 3: Append `coolifyRoutes` to `src/server/routes/coolify.ts`**

```ts
/** Build CoolifyCreds from an untrusted request body. */
function bodyToCreds(body: any): CoolifyCreds {
  return {
    instanceUrl: String(body?.instanceUrl ?? ''),
    token: String(body?.token ?? '').trim(),
    cfAccessId: body?.cfAccessId ? String(body.cfAccessId).trim() : undefined,
    cfAccessSecret: body?.cfAccessSecret ? String(body.cfAccessSecret) : undefined,
  };
}

interface ConnectBody extends CoolifyCreds {
  resourceType: 'service' | 'application';
  resourceUuid: string;
  resourceName?: string;
  targetEnvironment?: string;
  syncMode?: 'merge' | 'overwrite';
}

export async function coolifyRoutes(app: FastifyInstance) {
  // Vault lock guard (mirror of the Supabase routes).
  app.addHook('preHandler', async (_req, reply) => {
    try {
      app.vault.requireKey();
    } catch {
      return reply.status(403).send({ error: 'Vault is locked' });
    }
  });

  // POST /coolify/test — validate connectivity + token (does not persist).
  app.post<{ Body: CoolifyCreds }>('/coolify/test', async (req, reply) => {
    const creds = bodyToCreds(req.body);
    if (!creds.instanceUrl.trim() || !creds.token) {
      return reply.status(400).send({ error: 'Instance URL and API token are required' });
    }
    try {
      const resources = await listCoolifyResources(creds);
      return { success: true, count: resources.length };
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // POST /coolify/resources — services + applications for the picker.
  app.post<{ Body: CoolifyCreds }>('/coolify/resources', async (req, reply) => {
    const creds = bodyToCreds(req.body);
    if (!creds.instanceUrl.trim() || !creds.token) {
      return reply.status(400).send({ error: 'Instance URL and API token are required' });
    }
    try {
      return await listCoolifyResources(creds);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // POST /coolify/connect/:projectId — encrypt + store config, run initial sync.
  app.post<{ Params: { projectId: string }; Body: ConnectBody }>(
    '/coolify/connect/:projectId',
    async (req, reply) => {
      const b = req.body;
      const project = app.db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.projectId) as any;
      if (!project) return reply.status(404).send({ error: 'Project not found' });

      const creds = bodyToCreds(b);
      if (!creds.instanceUrl.trim() || !creds.token || !b.resourceUuid || (b.resourceType !== 'service' && b.resourceType !== 'application')) {
        return reply.status(400).send({ error: 'Missing required Coolify connection fields' });
      }

      // Validate the resource is reachable before persisting anything.
      try {
        await fetchCoolifyEnv(creds, b.resourceType, b.resourceUuid);
      } catch (err: any) {
        return reply.status(400).send({ error: `Failed to connect: ${err.message}` });
      }

      const vaultKey = app.vault.requireKey();
      const tokEnc = encrypt(creds.token, vaultKey);
      let secCipher: string | null = null, secIv: string | null = null, secTag: string | null = null;
      if (creds.cfAccessSecret) {
        const e = encrypt(creds.cfAccessSecret, vaultKey);
        secCipher = e.ciphertext; secIv = e.iv; secTag = e.authTag;
      }

      app.db.prepare(
        `UPDATE projects SET
          coolify_instance_url = ?,
          coolify_api_token_encrypted = ?, coolify_api_token_iv = ?, coolify_api_token_auth_tag = ?,
          coolify_cf_access_client_id = ?,
          coolify_cf_access_secret_encrypted = ?, coolify_cf_access_secret_iv = ?, coolify_cf_access_secret_auth_tag = ?,
          coolify_resource_type = ?, coolify_resource_uuid = ?, coolify_resource_name = ?,
          coolify_target_environment = ?, coolify_sync_mode = ?,
          updated_at = datetime('now')
        WHERE id = ?`
      ).run(
        normalizeInstanceUrl(creds.instanceUrl),
        tokEnc.ciphertext, tokEnc.iv, tokEnc.authTag,
        creds.cfAccessId ?? null,
        secCipher, secIv, secTag,
        b.resourceType, b.resourceUuid, b.resourceName ?? '',
        b.targetEnvironment || 'prod', b.syncMode === 'overwrite' ? 'overwrite' : 'merge',
        req.params.projectId
      );

      logAudit(app.db, 'coolify_connected', 'project', req.params.projectId, project.name, {
        resourceType: b.resourceType,
        resourceName: b.resourceName ?? '',
      });

      const sync = await syncProject(app.db, vaultKey, req.params.projectId);
      return {
        success: true,
        resource: { type: b.resourceType, uuid: b.resourceUuid, name: b.resourceName ?? '' },
        sync,
      };
    }
  );

  // POST /coolify/sync/:projectId — manual re-sync.
  app.post<{ Params: { projectId: string } }>('/coolify/sync/:projectId', async (req, reply) => {
    const project = app.db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.projectId) as any;
    if (!project) return reply.status(404).send({ error: 'Project not found' });
    if (!project.coolify_instance_url || !project.coolify_api_token_encrypted) {
      return reply.status(400).send({ error: 'Project is not connected to Coolify' });
    }
    const vaultKey = app.vault.requireKey();
    const result = await syncProject(app.db, vaultKey, req.params.projectId);
    logAudit(app.db, 'coolify_synced', 'project', req.params.projectId, project.name, {
      updated: result.updated, unchanged: result.unchanged,
    });
    return result;
  });

  // GET /coolify/status/:projectId — connection status (no secret values).
  app.get<{ Params: { projectId: string } }>('/coolify/status/:projectId', async (req, reply) => {
    const project = app.db.prepare(
      `SELECT coolify_instance_url, coolify_api_token_encrypted, coolify_resource_type,
        coolify_resource_name, coolify_target_environment, coolify_sync_mode, coolify_last_sync
       FROM projects WHERE id = ?`
    ).get(req.params.projectId) as any;
    if (!project) return reply.status(404).send({ error: 'Project not found' });

    const connected = !!(project.coolify_instance_url && project.coolify_api_token_encrypted);
    return {
      connected,
      instanceUrl: connected ? project.coolify_instance_url : '',
      resourceType: connected ? project.coolify_resource_type : '',
      resourceName: connected ? project.coolify_resource_name : '',
      targetEnvironment: connected ? project.coolify_target_environment : '',
      syncMode: connected ? project.coolify_sync_mode : '',
      lastSync: connected ? project.coolify_last_sync : null,
    };
  });

  // POST /coolify/disconnect/:projectId — clear config, demote managed secrets.
  app.post<{ Params: { projectId: string } }>('/coolify/disconnect/:projectId', async (req, reply) => {
    const project = app.db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.projectId) as any;
    if (!project) return reply.status(404).send({ error: 'Project not found' });

    app.db.prepare(
      `UPDATE projects SET
        coolify_instance_url = '',
        coolify_api_token_encrypted = NULL, coolify_api_token_iv = NULL, coolify_api_token_auth_tag = NULL,
        coolify_cf_access_client_id = NULL,
        coolify_cf_access_secret_encrypted = NULL, coolify_cf_access_secret_iv = NULL, coolify_cf_access_secret_auth_tag = NULL,
        coolify_resource_type = '', coolify_resource_uuid = '', coolify_resource_name = '',
        coolify_last_sync = NULL,
        updated_at = datetime('now')
      WHERE id = ?`
    ).run(req.params.projectId);

    const envs = app.db.prepare('SELECT id FROM environments WHERE project_id = ?').all(req.params.projectId) as any[];
    for (const env of envs) {
      app.db.prepare("UPDATE secrets SET source = 'manual' WHERE environment_id = ? AND source = 'coolify'").run(env.id);
    }

    logAudit(app.db, 'coolify_disconnected', 'project', req.params.projectId, project.name, {});
    return { success: true };
  });
}
```

- [ ] **Step 4: Register the routes**

In `src/server/index.ts`, add the import after line 17 (`import { supabaseRoutes } ...`):

```ts
import { coolifyRoutes } from './routes/coolify.js';
```

And register it after line 57 (`await app.register(supabaseRoutes, { prefix: '/api' });`):

```ts
  await app.register(coolifyRoutes, { prefix: '/api' });
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/server/coolify.test.ts`
Expected: PASS (sync + routes describe blocks).

- [ ] **Step 6: Commit**

```bash
git add src/server/routes/coolify.ts src/server/index.ts src/__tests__/server/coolify.test.ts
git commit -m "feat(coolify): connect/sync/status/disconnect routes + registration"
```

---

### Task 5: API client bindings (`api.coolify.*`)

**Files:**
- Modify: `src/web/src/api/client.ts` (add types after `SupabaseSyncResult` ~line 97; add `coolify` object after the `supabase` block ~line 233)

**Interfaces:**
- Consumes: the server routes from Task 4.
- Produces (exported):
  - `interface CoolifyStatus { connected: boolean; instanceUrl: string; resourceType: string; resourceName: string; targetEnvironment: string; syncMode: string; lastSync: string | null }`
  - `interface CoolifyResource { type: 'service' | 'application'; uuid: string; name: string }`
  - `interface CoolifySyncResult { synced: number; updated: number; unchanged: number; skippedEmpty: number; conflicts: string[]; errors: string[] }`
  - `api.coolify.test`, `.resources`, `.connect`, `.sync`, `.status`, `.disconnect`

- [ ] **Step 1: Add the types**

In `src/web/src/api/client.ts`, after the `SupabaseSyncResult` interface (line 97), add:

```ts
export interface CoolifyStatus {
  connected: boolean;
  instanceUrl: string;
  resourceType: string;
  resourceName: string;
  targetEnvironment: string;
  syncMode: string;
  lastSync: string | null;
}

export interface CoolifyResource {
  type: 'service' | 'application';
  uuid: string;
  name: string;
}

export interface CoolifySyncResult {
  synced: number;
  updated: number;
  unchanged: number;
  skippedEmpty: number;
  conflicts: string[];
  errors: string[];
}

export interface CoolifyConnectArgs {
  instanceUrl: string;
  token: string;
  cfAccessId?: string;
  cfAccessSecret?: string;
  resourceType: 'service' | 'application';
  resourceUuid: string;
  resourceName: string;
  targetEnvironment: string;
  syncMode: 'merge' | 'overwrite';
}
```

- [ ] **Step 2: Add the `coolify` API object**

In the `api` object, immediately after the `supabase: { ... },` block (closes at line 233), add:

```ts
  coolify: {
    test: (creds: { instanceUrl: string; token: string; cfAccessId?: string; cfAccessSecret?: string }) =>
      post<{ success: boolean; count: number }>('/coolify/test', creds),
    resources: (creds: { instanceUrl: string; token: string; cfAccessId?: string; cfAccessSecret?: string }) =>
      post<CoolifyResource[]>('/coolify/resources', creds),
    connect: (projectId: string, args: CoolifyConnectArgs) =>
      post<{ success: boolean; resource: CoolifyResource; sync: CoolifySyncResult }>(`/coolify/connect/${projectId}`, args),
    sync: (projectId: string) =>
      post<CoolifySyncResult>(`/coolify/sync/${projectId}`),
    status: (projectId: string) =>
      get<CoolifyStatus>(`/coolify/status/${projectId}`),
    disconnect: (projectId: string) =>
      post<{ success: boolean }>(`/coolify/disconnect/${projectId}`),
  },
```

- [ ] **Step 3: Typecheck the web package**

Run: `cd src/web && npx tsc --noEmit`
Expected: no errors from `client.ts`.

- [ ] **Step 4: Commit**

```bash
git add src/web/src/api/client.ts
git commit -m "feat(coolify): api.coolify.* client bindings + types"
```

---

### Task 6: Connect-Coolify UI block in `SecretsTab.tsx`

**Files:**
- Modify: `src/web/src/index.css` (add `--color-brand-coolify` token near line 43)
- Modify: `src/web/src/components/SecretsTab.tsx` (imports; Coolify state; handlers; a second connector card inside the Integrations section)

**Interfaces:**
- Consumes: `api.coolify.*`, `CoolifyStatus`, `CoolifyResource` from Task 5.
- Produces: user-facing Coolify connector (no exported symbols). No automated test — the project has no React Testing Library; verification is `build:web` + a manual smoke check.

Note: this task has no unit test. Its deliverable is verified by a successful web build (typecheck) and a manual smoke check in the running app. Keep it a single reviewable commit.

- [ ] **Step 1: Add the brand color token**

In `src/web/src/index.css`, next to `--color-brand-supabase: #3ecf8e;` (line 43), add:

```css
  --color-brand-coolify: #8b5cf6;
```

(Coolify's accent violet. Adjust the hex if you prefer a different Coolify brand color — it only drives the connector's accent.)

- [ ] **Step 2: Extend the imports**

In `src/web/src/components/SecretsTab.tsx`, update line 3 and line 5.

Replace the lucide import (line 3):

```tsx
import { Plus, Upload, Download, KeyRound, Database, RefreshCw, Unlink, Check, Server, HelpCircle } from 'lucide-react';
```

Replace the api import (line 5):

```tsx
import { api, type SupabaseStatus, type CoolifyStatus, type CoolifyResource } from '../api/client';
```

- [ ] **Step 3: Add Coolify state + handlers**

In `SecretsTab.tsx`, after the Supabase state block (after line 62, `const [sbSyncing, setSbSyncing] = useState(false);`), add:

```tsx
  // Coolify connection state
  const [cfStatus, setCfStatus] = useState<CoolifyStatus | null>(null);
  const [cfStep, setCfStep] = useState<'idle' | 'creds' | 'pick'>('idle');
  const [cfInstanceUrl, setCfInstanceUrl] = useState('');
  const [cfToken, setCfToken] = useState('');
  const [cfAccessId, setCfAccessId] = useState('');
  const [cfAccessSecret, setCfAccessSecret] = useState('');
  const [cfShowAccess, setCfShowAccess] = useState(false);
  const [cfResources, setCfResources] = useState<CoolifyResource[]>([]);
  const [cfSelectedUuid, setCfSelectedUuid] = useState('');
  const [cfTargetEnv, setCfTargetEnv] = useState('prod');
  const [cfSyncMode, setCfSyncMode] = useState<'merge' | 'overwrite'>('merge');
  const [cfLoading, setCfLoading] = useState(false);
  const [cfError, setCfError] = useState<string | null>(null);
  const [cfSyncResult, setCfSyncResult] = useState<string | null>(null);
  const [cfSyncing, setCfSyncing] = useState(false);
  const [cfHelpOpen, setCfHelpOpen] = useState(false);
```

Extend the existing status `useEffect` (lines 64-68) to also load Coolify status. Replace it with:

```tsx
  useEffect(() => {
    if (currentProject) {
      api.supabase.status(currentProject.id).then(setSbStatus).catch(() => {});
      api.coolify.status(currentProject.id).then(setCfStatus).catch(() => {});
      // Default the target-env picker to the project's default environment.
      setCfTargetEnv(currentProject.default_environment || 'prod');
    }
  }, [currentProject?.id]);
```

Then add the Coolify handlers right after `handleSbDisconnect` (after line 162):

```tsx
  const cfCreds = () => ({
    instanceUrl: cfInstanceUrl.trim(),
    token: cfToken.trim(),
    cfAccessId: cfAccessId.trim() || undefined,
    cfAccessSecret: cfAccessSecret.trim() || undefined,
  });

  const resetCfFlow = () => {
    setCfStep('idle');
    setCfError(null);
    setCfToken('');
    setCfAccessId('');
    setCfAccessSecret('');
    setCfShowAccess(false);
    setCfResources([]);
    setCfSelectedUuid('');
    setCfSyncMode('merge');
  };

  const handleCfFetchResources = async () => {
    if (!cfInstanceUrl.trim() || !cfToken.trim()) return;
    setCfLoading(true);
    setCfError(null);
    try {
      const resources = await api.coolify.resources(cfCreds());
      setCfResources(resources);
      setCfSelectedUuid('');
      setCfStep('pick');
    } catch (err: unknown) {
      setCfError(err instanceof Error ? err.message : 'Could not reach Coolify');
    } finally {
      setCfLoading(false);
    }
  };

  const handleCfConnect = async () => {
    if (!currentProject || !cfSelectedUuid) return;
    const picked = cfResources.find((r) => r.uuid === cfSelectedUuid);
    if (!picked) return;
    setCfLoading(true);
    setCfError(null);
    try {
      const result = await api.coolify.connect(currentProject.id, {
        ...cfCreds(),
        resourceType: picked.type,
        resourceUuid: picked.uuid,
        resourceName: picked.name,
        targetEnvironment: cfTargetEnv,
        syncMode: cfSyncMode,
      });
      setCfStatus({
        connected: true,
        instanceUrl: cfInstanceUrl.trim(),
        resourceType: picked.type,
        resourceName: picked.name,
        targetEnvironment: cfTargetEnv,
        syncMode: cfSyncMode,
        lastSync: new Date().toISOString(),
      });
      setCfSyncResult(`Imported ${result.sync.updated} secrets`);
      resetCfFlow();
      fetchSecrets();
    } catch (err: unknown) {
      setCfError(err instanceof Error ? err.message : 'Connection failed');
    } finally {
      setCfLoading(false);
    }
  };

  const handleCfSync = async () => {
    if (!currentProject) return;
    setCfSyncing(true);
    setCfError(null);
    setCfSyncResult(null);
    try {
      const result = await api.coolify.sync(currentProject.id);
      setCfSyncResult(
        `Updated ${result.updated}, ${result.unchanged} unchanged` +
          (result.conflicts.length ? `, ${result.conflicts.length} conflicts` : '') +
          (result.errors.length ? ` — ${result.errors[0]}` : '')
      );
      setCfStatus((prev) => (prev ? { ...prev, lastSync: new Date().toISOString() } : prev));
      fetchSecrets();
    } catch (err: unknown) {
      setCfError(err instanceof Error ? err.message : 'Sync failed');
    } finally {
      setCfSyncing(false);
    }
  };

  const handleCfDisconnect = async () => {
    if (!currentProject) return;
    setCfError(null);
    try {
      await api.coolify.disconnect(currentProject.id);
      setCfStatus({ connected: false, instanceUrl: '', resourceType: '', resourceName: '', targetEnvironment: '', syncMode: '', lastSync: null });
      setCfStep('idle');
      fetchSecrets();
    } catch (err: unknown) {
      setCfError(err instanceof Error ? err.message : 'Disconnect failed');
    }
  };
```

- [ ] **Step 4: Render the Coolify connector card**

In the Integrations section, add a second card after the Supabase card's closing `</div>`. The Supabase card `<div className="max-w-sm border border-brand-supabase/20 ...">` opens at line 294 and closes at line 554 (`</div>` just before line 555's `</div>`). Insert the following block between that Supabase card's closing `</div>` (line 554) and the Integrations wrapper's closing `</div>` (line 555):

```tsx
          {/* Coolify connector — self-hosted stacks */}
          <div className="max-w-sm border border-brand-coolify/20 rounded-xl p-4 bg-brand-coolify/3">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Server size={14} className="text-brand-coolify" />
                <span className="text-[12px] font-semibold text-brand-coolify tracking-[0.05em] uppercase">
                  Coolify
                </span>
              </div>
              <button
                type="button"
                aria-label="Coolify sync help"
                onClick={() => setCfHelpOpen((v) => !v)}
                className="text-text-muted hover:text-text-secondary transition-colors focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2 rounded-sm"
              >
                <HelpCircle size={14} strokeWidth={1.5} />
              </button>
            </div>

            {cfHelpOpen && (
              <p className="text-[11px] text-text-muted leading-relaxed m-0 mb-3">
                Pull env vars from a self-hosted Coolify service or application into this
                project. Create a read API token in Coolify → Keys &amp; Tokens → API
                tokens. If your instance is behind Cloudflare Access, add a service-token
                Client Id / Secret, or an Access bypass for <span className="font-mono">/api/*</span>.
                Values sync into the chosen environment; merge never deletes your own secrets.
              </p>
            )}

            {cfStatus?.connected ? (
              <div className="flex flex-col gap-2.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[14px] font-semibold text-text-primary min-w-0 truncate">
                    {cfStatus.resourceName || 'Connected'}
                  </span>
                  <span className="text-[10px] font-semibold text-brand-coolify bg-brand-coolify/10 border border-brand-coolify/25 rounded-md px-1.5 py-0.5 whitespace-nowrap">
                    {cfStatus.resourceType}
                  </span>
                  <span className="text-[10px] font-semibold text-text-muted bg-surface border border-border-default rounded-md px-1.5 py-0.5 whitespace-nowrap">
                    → {cfStatus.targetEnvironment} · {cfStatus.syncMode}
                  </span>
                </div>
                <p className="text-[12px] text-text-muted m-0">
                  {cfStatus.lastSync
                    ? `Last synced ${new Date(cfStatus.lastSync + (cfStatus.lastSync.endsWith('Z') ? '' : 'Z')).toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit', hour12: true, month: 'short', day: 'numeric' })}`
                    : 'Never synced'}
                </p>
                {cfSyncResult && <p className="text-[12px] text-text-secondary m-0">{cfSyncResult}</p>}
                {cfError && <p className="text-[12px] text-danger m-0">{cfError}</p>}
                <div className="flex gap-2 flex-wrap">
                  <button
                    type="button"
                    disabled={cfSyncing}
                    onClick={handleCfSync}
                    className={cn(
                      'h-8 px-3 text-[12px] font-semibold text-brand-coolify bg-transparent',
                      'border border-brand-coolify/30 rounded-lg cursor-pointer',
                      'flex items-center gap-1.5 whitespace-nowrap transition-colors duration-150',
                      'hover:bg-brand-coolify/8 disabled:opacity-60 disabled:pointer-events-none',
                      'focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2',
                    )}
                  >
                    <RefreshCw size={12} className={cfSyncing ? 'spin' : undefined} />
                    {cfSyncing ? 'Syncing…' : 'Sync Now'}
                  </button>
                  <button
                    type="button"
                    onClick={handleCfDisconnect}
                    className={cn(
                      'h-8 px-3 text-[12px] font-semibold text-text-muted bg-transparent',
                      'border border-border-default rounded-lg cursor-pointer',
                      'flex items-center gap-1.5 whitespace-nowrap transition-colors duration-150',
                      'hover:bg-danger/8 hover:text-danger',
                      'focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2',
                    )}
                  >
                    <Unlink size={12} />
                    Disconnect
                  </button>
                </div>
              </div>
            ) : cfStep === 'idle' ? (
              <div>
                <p className="text-[12px] text-text-muted m-0 mb-3 leading-relaxed">
                  Sync env vars from a self-hosted Coolify stack.
                </p>
                <button
                  type="button"
                  onClick={() => setCfStep('creds')}
                  className={cn(
                    'h-8 px-3 text-[12px] font-semibold text-brand-coolify bg-transparent',
                    'border border-brand-coolify/30 rounded-lg cursor-pointer',
                    'flex items-center gap-1.5 transition-colors duration-150 hover:bg-brand-coolify/8',
                    'focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2',
                  )}
                >
                  <Server size={12} />
                  Connect to Coolify
                </button>
              </div>
            ) : cfStep === 'creds' ? (
              <div className="flex flex-col gap-3">
                <div>
                  <label className="block text-[12px] font-semibold text-text-secondary tracking-[0.05em] uppercase mb-1.5">
                    Instance URL
                  </label>
                  <Input
                    type="text"
                    value={cfInstanceUrl}
                    onChange={(e) => setCfInstanceUrl(e.target.value)}
                    placeholder="https://coolify.example.com"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-[12px] font-semibold text-text-secondary tracking-[0.05em] uppercase mb-1.5">
                    API Token
                  </label>
                  <Input
                    type="password"
                    revealable
                    value={cfToken}
                    onChange={(e) => setCfToken(e.target.value)}
                    placeholder="Coolify API token"
                    onKeyDown={(e) => { if (e.key === 'Enter' && cfInstanceUrl.trim() && cfToken.trim()) handleCfFetchResources(); }}
                  />
                  <p className="text-[11px] text-text-muted mt-1.5 mb-0">
                    Coolify → Keys &amp; Tokens → API tokens (read scope is enough).
                  </p>
                </div>

                {!cfShowAccess ? (
                  <button
                    type="button"
                    onClick={() => setCfShowAccess(true)}
                    className="text-[11px] font-semibold text-brand-coolify hover:underline self-start bg-transparent border-0 cursor-pointer p-0"
                  >
                    + Add Cloudflare Access service token
                  </button>
                ) : (
                  <div className="flex flex-col gap-2 rounded-lg border border-border-default bg-abyss p-3">
                    <label className="block text-[11px] font-semibold text-text-muted tracking-[0.05em] uppercase">
                      Cloudflare Access (optional)
                    </label>
                    <Input type="text" value={cfAccessId} onChange={(e) => setCfAccessId(e.target.value)} placeholder="CF-Access-Client-Id" />
                    <Input type="password" revealable value={cfAccessSecret} onChange={(e) => setCfAccessSecret(e.target.value)} placeholder="CF-Access-Client-Secret" />
                  </div>
                )}

                {cfError && <p className="text-[12px] text-danger m-0">{cfError}</p>}
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" onClick={resetCfFlow}>Cancel</Button>
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={cfLoading || !cfInstanceUrl.trim() || !cfToken.trim()}
                    loading={cfLoading}
                    onClick={handleCfFetchResources}
                    className="bg-brand-coolify hover:bg-brand-coolify/90 border-transparent"
                  >
                    {cfLoading ? 'Connecting…' : 'Connect'}
                  </Button>
                </div>
              </div>
            ) : cfStep === 'pick' ? (
              <div className="flex flex-col gap-3">
                <div>
                  <label className="block text-[12px] font-semibold text-text-secondary tracking-[0.05em] uppercase mb-1.5">
                    Resource
                  </label>
                  {cfResources.length === 0 ? (
                    <p className="text-[12px] text-text-muted m-0">No services or applications found.</p>
                  ) : (
                    <div className="flex flex-col gap-1.5 max-h-50 overflow-y-auto">
                      {cfResources.map((r) => (
                        <button
                          key={r.uuid}
                          type="button"
                          onClick={() => setCfSelectedUuid(r.uuid)}
                          className={cn(
                            'flex items-center gap-2.5 px-3 py-2.5 rounded-lg cursor-pointer text-left w-full transition-colors duration-150',
                            'focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2',
                            cfSelectedUuid === r.uuid
                              ? 'bg-brand-coolify/8 border border-brand-coolify/40'
                              : 'bg-abyss border border-border-default hover:bg-surface-hover',
                          )}
                        >
                          <Server size={14} className={cfSelectedUuid === r.uuid ? 'text-brand-coolify' : 'text-text-muted'} />
                          <div className="flex-1 min-w-0">
                            <div className={cn('text-[13px] font-semibold truncate', cfSelectedUuid === r.uuid ? 'text-text-primary' : 'text-text-secondary')}>
                              {r.name}
                            </div>
                            <div className="text-[11px] text-text-muted font-mono truncate">{r.type} · {r.uuid}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {cfSelectedUuid && (
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <label className="block text-[12px] font-semibold text-text-secondary tracking-[0.05em] uppercase mb-1.5">
                        Target env
                      </label>
                      <Select value={cfTargetEnv} onChange={(e) => setCfTargetEnv(e.target.value)}>
                        {(currentProject?.environments ?? []).map((env) => (
                          <option key={env.id} value={env.slug}>{env.name}</option>
                        ))}
                      </Select>
                    </div>
                    <div className="flex-1">
                      <label className="block text-[12px] font-semibold text-text-secondary tracking-[0.05em] uppercase mb-1.5">
                        Sync mode
                      </label>
                      <Select value={cfSyncMode} onChange={(e) => setCfSyncMode(e.target.value as 'merge' | 'overwrite')}>
                        <option value="merge">Merge</option>
                        <option value="overwrite">Overwrite</option>
                      </Select>
                    </div>
                  </div>
                )}

                {cfError && <p className="text-[12px] text-danger m-0">{cfError}</p>}
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" onClick={() => { setCfStep('creds'); setCfError(null); }}>Back</Button>
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={cfLoading || !cfSelectedUuid}
                    loading={cfLoading}
                    onClick={handleCfConnect}
                    className="bg-brand-coolify hover:bg-brand-coolify/90 border-transparent"
                  >
                    {cfLoading ? 'Connecting…' : 'Connect & Sync'}
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
```

- [ ] **Step 5: Build the web bundle to typecheck**

Run: `cd src/web && npx vite build`
Expected: build succeeds (no TS/JSX errors). If `currentProject.default_environment` or `env.slug`/`env.name` type errors appear, confirm the `Project`/`Environment` types in `client.ts` expose those fields (they do — `default_environment` on `Project`, `slug`/`name` on `Environment`).

- [ ] **Step 6: Manual smoke check**

Run the app (`npm run dev`), open a project's Secrets tab, and confirm: the Coolify card renders next to Supabase; the `?` help toggles guidance; "Connect to Coolify" opens the creds step; the CF Access fields expand on demand. (Full end-to-end sync needs a real Coolify token — see the plan's closing note.)

- [ ] **Step 7: Commit**

```bash
git add src/web/src/index.css src/web/src/components/SecretsTab.tsx
git commit -m "feat(coolify): Connect Coolify UI in Secrets tab"
```

---

### Task 7: Full regression + final verification

**Files:** none (verification only).

- [ ] **Step 1: Run the whole test suite**

Run: `npm test`
Expected: all suites pass, including the new `coolify-client.test.ts` and `coolify.test.ts`.

- [ ] **Step 2: Build the web bundle**

Run: `npm run build:web`
Expected: succeeds.

- [ ] **Step 3: Confirm no stray secret logging**

Run: `grep -n "real_value\|console.log" src/server/routes/coolify.ts`
Expected: `real_value` appears only in `fetchCoolifyEnv` value-resolution; no `console.log` of values.

- [ ] **Step 4: Commit (if any doc/tweak changes remain)**

```bash
git add -A && git commit -m "chore(coolify): final verification pass" || echo "nothing to commit"
```

---

## Self-Review

**Spec coverage:**
- §2 data model → Task 1 (all columns, incl. CF Access + mode/target/last_sync). ✓
- §3 API reference (services/applications/envs, Bearer, Accept) → Task 2 `coolifyFetch`/`listCoolifyResources`/`fetchCoolifyEnv`. ✓
- §4 sync algorithm (real_value preference, writeSecrets, merge/overwrite, stamp last_sync) → Tasks 2–3. ✓
- §5 reference impl → Tasks 2 mirror it. ✓
- §6 Cloudflare Access (service-token headers + friendly error + explicit instance URL for localhost) → Task 2 (`coolifyFetch` headers + Access-login detection) and Task 6 (optional CF fields; instance URL is free-text so `http://localhost:8000` works). ✓
- §7 UI flow (instance URL, token, optional CF fields, test connection, resource picker grouped, target env + sync mode, save + sync now, re-sync) → Task 6. Grouping: resources carry a `type` shown per-row; the picker lists both kinds with type labels. ✓
- §8 security (encrypt token + CF secret, no value logging, read-only, default merge) → Global Constraints + Tasks 3/4; Task 7 Step 3 greps for leaks. ✓
- §9 test checklist → covered by Task 2/3/4 tests (real_value resolution, `${...}` case, application path, merge vs overwrite, last_sync, CF Access error, encrypted-at-rest). The "sync an application (static site)" and "with a valid service token succeeds" live cases require a real instance — noted as manual in the closing note. ✓
- §10 independent/mutually-exclusive integrations → separate columns + `source='coolify'`; no coupling to Supabase code. ✓

**Placeholder scan:** No TBD/TODO; every code step contains full code; no "similar to Task N". ✓

**Type consistency:** `CoolifyCreds`, `CoolifyResource`, `CoolifySyncResult`, `CoolifyStatus` names match between server (`coolify.ts`) and client (`client.ts`); `syncProject(db, vaultKey, projectId)` 3-arg signature is consistent across Tasks 3, 4, and its tests; `resourceType` union `'service'|'application'` consistent throughout; sync result fields (`synced/updated/unchanged/skippedEmpty/conflicts/errors`) identical in server interface, client interface, and tests. ✓

**Note on live verification:** the automated tests mock `fetch`, so they fully cover logic without a Coolify box. The three inherently-live checklist items (real service sync, real application sync, real CF service-token success) require a Coolify API token (and CF Access service token if the instance is gated). Perform those manually once credentials are available.
