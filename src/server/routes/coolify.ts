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
    // credsFromProject()/syncProject() call decrypt() unwrapped internally — a
    // stale/rotated vault key throws there. Guard it the same way the Supabase
    // sync route guards its decrypt() call, so a bad key yields 400, not 500.
    let result: CoolifySyncResult;
    try {
      result = await syncProject(app.db, vaultKey, req.params.projectId);
    } catch {
      return reply.status(400).send({ error: 'Failed to decrypt Coolify credentials — vault key may have changed' });
    }
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
        coolify_target_environment = 'prod', coolify_sync_mode = 'merge',
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
