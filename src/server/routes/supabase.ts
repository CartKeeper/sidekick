// src/server/routes/supabase.ts
import type { FastifyInstance } from 'fastify';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { newId, logAudit } from '../../core/db.js';
import { encrypt, decrypt } from '../../core/crypto.js';

const SUPABASE_API = 'https://api.supabase.com';

// Env-var prefix per framework. PUBLIC Supabase creds (URL + anon key) need a
// framework-specific prefix to reach the browser bundle; server-only secrets
// (service role, JWT) are never prefixed.
const ENV_STYLE_PREFIX: Record<string, string> = { plain: '', vite: 'VITE_', next: 'NEXT_PUBLIC_' };
const ALL_PUBLIC_PREFIXES = ['', 'VITE_', 'NEXT_PUBLIC_'];

/**
 * Sniff a project's folder to guess which env-var conventions it uses, so the
 * connect flow can pre-select the right prefixes. Always includes 'plain'
 * (server code and the Supabase CLI read unprefixed names).
 */
export function detectEnvStyles(projectPath: string): string[] {
  const styles: string[] = [];
  if (projectPath && existsSync(projectPath)) {
    try {
      let deps: Record<string, string> = {};
      const pkgPath = join(projectPath, 'package.json');
      if (existsSync(pkgPath)) {
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
        deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
      }
      const hasFile = (...names: string[]) => names.some((n) => existsSync(join(projectPath, n)));
      if (deps['next'] || hasFile('next.config.js', 'next.config.ts', 'next.config.mjs')) styles.push('next');
      if (deps['vite'] || hasFile('vite.config.js', 'vite.config.ts', 'vite.config.mjs')) styles.push('vite');
    } catch {
      // Unreadable package.json etc. — fall through to the plain default.
    }
  }
  styles.push('plain');
  return styles;
}

interface SyncResult {
  updated: number;
  unchanged: number;
  conflicts: string[];
  errors: string[];
}

async function supabaseFetch(path: string, token: string) {
  const res = await fetch(`${SUPABASE_API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase API ${res.status}: ${text}`);
  }
  return res.json();
}

/**
 * Run a sync for a project — pulls all credentials from Supabase and upserts them as secrets.
 */
function syncProject(
  db: any,
  vaultKey: Buffer,
  projectId: string,
  supabaseRef: string,
  token: string
): Promise<SyncResult> {
  return (async () => {
    const result: SyncResult = { updated: 0, unchanged: 0, conflicts: [], errors: [] };

    // Get all environments for this project
    const envs = db.prepare('SELECT * FROM environments WHERE project_id = ?').all(projectId) as any[];
    if (envs.length === 0) {
      result.errors.push('No environments found for project');
      return result;
    }

    // Resolve each credential to a single canonical value pulled from Supabase.
    const url = `https://${supabaseRef}.supabase.co`;
    let region: string | null = null;
    let anonKey: string | null = null;
    let serviceRoleKey: string | null = null;
    let jwtSecret: string | null = null;

    try {
      // Project info → region (URL is derived from the ref above)
      const project = await supabaseFetch(`/v1/projects/${supabaseRef}`, token);
      if (project.region) region = project.region;
    } catch (err: any) {
      result.errors.push(`Project info: ${err.message}`);
    }

    try {
      // API keys
      const keys = await supabaseFetch(`/v1/projects/${supabaseRef}/api-keys`, token);
      for (const key of keys) {
        if (key.name === 'anon') anonKey = key.api_key;
        else if (key.name === 'service_role') serviceRoleKey = key.api_key;
      }
    } catch (err: any) {
      result.errors.push(`API keys: ${err.message}`);
    }

    try {
      // PostgREST config → JWT secret
      const postgrest = await supabaseFetch(`/v1/projects/${supabaseRef}/postgrest`, token);
      if (postgrest.jwt_secret) jwtSecret = postgrest.jwt_secret;
    } catch (err: any) {
      result.errors.push(`PostgREST config: ${err.message}`);
    }

    // NOTE: We intentionally do NOT pull Edge Function secrets from
    // /v1/projects/{ref}/secrets. That endpoint returns a SHA-256 digest of
    // each secret value, not the plaintext — Supabase does not let you read
    // edge secrets back after they are written. Storing the digest corrupts
    // the .env at launch time.

    // Which env-var prefixes to emit for the PUBLIC creds (URL + anon key).
    // Stored per project at connect time; fall back to the legacy default
    // (unprefixed + NEXT_PUBLIC) for connections made before this existed, so
    // re-syncing an old project never silently renames its keys.
    const styleRow = db.prepare('SELECT supabase_env_styles FROM projects WHERE id = ?').get(projectId) as any;
    let styles: string[];
    try {
      const parsed = JSON.parse(styleRow?.supabase_env_styles ?? 'null');
      styles = Array.isArray(parsed) && parsed.length ? parsed : ['plain', 'next'];
    } catch {
      styles = ['plain', 'next'];
    }
    const selectedPrefixes = styles
      .map((s) => ENV_STYLE_PREFIX[s])
      .filter((p): p is string => p !== undefined);
    const publicPrefixes = selectedPrefixes.length ? selectedPrefixes : [''];
    // Other prefixes are UPDATED only if they already exist — never created — so
    // we keep stray variants correct without injecting names a project never used.
    const otherPrefixes = ALL_PUBLIC_PREFIXES.filter((p) => !publicPrefixes.includes(p));

    // `canonical` names are always (re)written; `aliases` are update-if-present.
    type CredGroup = { value: string; canonical: string[]; aliases: string[] };
    const groups: CredGroup[] = [
      {
        value: url,
        canonical: publicPrefixes.map((p) => `${p}SUPABASE_URL`),
        aliases: otherPrefixes.map((p) => `${p}SUPABASE_URL`),
      },
    ];
    if (anonKey) {
      groups.push({
        value: anonKey,
        canonical: publicPrefixes.map((p) => `${p}SUPABASE_ANON_KEY`),
        aliases: otherPrefixes.map((p) => `${p}SUPABASE_ANON_KEY`),
      });
    }
    // Server-only secrets are NEVER public-prefixed.
    if (serviceRoleKey) {
      groups.push({ value: serviceRoleKey, canonical: ['SUPABASE_SERVICE_ROLE_KEY'], aliases: [] });
    }
    if (jwtSecret) {
      groups.push({ value: jwtSecret, canonical: ['SUPABASE_JWT_SECRET'], aliases: [] });
    }
    if (region) {
      groups.push({ value: region, canonical: ['SUPABASE_REGION'], aliases: [] });
    }

    // Upsert into every environment
    for (const env of envs) {
      const existingKeys = new Set(
        (db.prepare('SELECT key FROM secrets WHERE environment_id = ?').all(env.id) as any[]).map(
          (r: any) => r.key
        )
      );

      // Canonical names always; alias names only when already present in this env.
      const targets: { key: string; value: string }[] = [];
      for (const g of groups) {
        for (const k of g.canonical) targets.push({ key: k, value: g.value });
        for (const k of g.aliases) if (existingKeys.has(k)) targets.push({ key: k, value: g.value });
      }

      for (const { key, value } of targets) {
        const existing = db.prepare(
          'SELECT id, value_encrypted, iv, auth_tag, source FROM secrets WHERE environment_id = ? AND key = ?'
        ).get(env.id, key) as any;

        if (existing) {
          if (existing.source === 'manual') {
            // Conflict: user-created secret with same name — don't overwrite
            if (!result.conflicts.includes(key)) {
              result.conflicts.push(key);
            }
            continue;
          }

          // Check if value actually changed
          try {
            const currentValue = decrypt(
              { ciphertext: existing.value_encrypted, iv: existing.iv, authTag: existing.auth_tag },
              vaultKey
            );
            if (currentValue === value) {
              result.unchanged++;
              continue;
            }
          } catch {
            // Can't decrypt — just overwrite
          }

          // Update existing supabase-managed secret
          const enc = encrypt(value, vaultKey);
          db.prepare(
            "UPDATE secrets SET value_encrypted = ?, iv = ?, auth_tag = ?, source = 'supabase', updated_at = datetime('now') WHERE id = ?"
          ).run(enc.ciphertext, enc.iv, enc.authTag, existing.id);
          result.updated++;
        } else {
          // Create new secret
          const enc = encrypt(value, vaultKey);
          const type = detectType(key);
          db.prepare(
            "INSERT INTO secrets (id, environment_id, key, value_encrypted, iv, auth_tag, type, source) VALUES (?, ?, ?, ?, ?, ?, ?, 'supabase')"
          ).run(newId(), env.id, key, enc.ciphertext, enc.iv, enc.authTag, type);
          result.updated++;
        }
      }
    }

    // Update last sync timestamp
    db.prepare("UPDATE projects SET supabase_last_sync = datetime('now') WHERE id = ?").run(projectId);

    return result;
  })();
}

function detectType(key: string): string {
  const k = key.toUpperCase();
  if (k.includes('API_KEY') || k.includes('APIKEY') || k.includes('ANON_KEY')) return 'api_key';
  if (k.includes('SECRET') || k.includes('PRIVATE') || k.includes('SERVICE_ROLE')) return 'secret';
  if (k.includes('TOKEN') || k.includes('JWT')) return 'token';
  if (k.includes('PASSWORD') || k.includes('PASSWD')) return 'password';
  if (k.includes('URL') || k.includes('URI') || k.includes('DATABASE')) return 'connection';
  return 'generic';
}

export async function supabaseRoutes(app: FastifyInstance) {
  // Vault lock guard
  app.addHook('preHandler', async (_req, reply) => {
    try {
      app.vault.requireKey();
    } catch {
      return reply.status(403).send({ error: 'Vault is locked' });
    }
  });

  // POST /supabase/connect — link a Sidekick project to a Supabase project
  app.post<{
    Body: { projectId: string; accessToken: string; supabaseProjectRef: string; envStyles?: string[] };
  }>('/supabase/connect', async (req, reply) => {
    const { projectId, accessToken, supabaseProjectRef, envStyles } = req.body;

    const project = app.db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId) as any;
    if (!project) return reply.status(404).send({ error: 'Project not found' });

    // Validate token by fetching the Supabase project
    let supabaseProject: any;
    try {
      supabaseProject = await supabaseFetch(`/v1/projects/${supabaseProjectRef}`, accessToken);
    } catch (err: any) {
      return reply.status(400).send({ error: `Failed to connect: ${err.message}` });
    }

    // Resolve which env-var styles to store: sanitize the caller's choice, and
    // fall back to auto-detecting from the project folder if none provided.
    const validStyles = Array.isArray(envStyles)
      ? envStyles.filter((s) => s === 'plain' || s === 'vite' || s === 'next')
      : [];
    const stylesToStore = validStyles.length ? validStyles : detectEnvStyles(project.path);

    // Encrypt and store the token
    const vaultKey = app.vault.requireKey();
    const enc = encrypt(accessToken, vaultKey);

    app.db.prepare(
      `UPDATE projects SET
        supabase_project_ref = ?,
        supabase_token_encrypted = ?,
        supabase_token_iv = ?,
        supabase_token_auth_tag = ?,
        supabase_env_styles = ?,
        updated_at = datetime('now')
      WHERE id = ?`
    ).run(supabaseProjectRef, enc.ciphertext, enc.iv, enc.authTag, JSON.stringify(stylesToStore), projectId);

    logAudit(app.db, 'supabase_connected', 'project', projectId, project.name, {
      supabaseProject: supabaseProject.name,
      region: supabaseProject.region,
    });

    // Run initial sync
    const syncResult = await syncProject(app.db, vaultKey, projectId, supabaseProjectRef, accessToken);

    return {
      success: true,
      supabaseProject: {
        name: supabaseProject.name,
        region: supabaseProject.region,
        ref: supabaseProjectRef,
      },
      sync: syncResult,
    };
  });

  // POST /supabase/disconnect/:projectId — unlink Supabase
  app.post<{ Params: { projectId: string } }>(
    '/supabase/disconnect/:projectId',
    async (req, reply) => {
      const project = app.db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.projectId) as any;
      if (!project) return reply.status(404).send({ error: 'Project not found' });

      // Clear Supabase fields
      app.db.prepare(
        `UPDATE projects SET
          supabase_project_ref = '',
          supabase_last_sync = NULL,
          supabase_token_encrypted = NULL,
          supabase_token_iv = NULL,
          supabase_token_auth_tag = NULL,
          updated_at = datetime('now')
        WHERE id = ?`
      ).run(req.params.projectId);

      // Change supabase-managed secrets to manual
      const envs = app.db.prepare('SELECT id FROM environments WHERE project_id = ?').all(req.params.projectId) as any[];
      for (const env of envs) {
        app.db.prepare(
          "UPDATE secrets SET source = 'manual' WHERE environment_id = ? AND source = 'supabase'"
        ).run(env.id);
      }

      logAudit(app.db, 'supabase_disconnected', 'project', req.params.projectId, project.name, {});

      return { success: true };
    }
  );

  // POST /supabase/sync/:projectId — manual sync
  app.post<{ Params: { projectId: string } }>(
    '/supabase/sync/:projectId',
    async (req, reply) => {
      const project = app.db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.projectId) as any;
      if (!project) return reply.status(404).send({ error: 'Project not found' });
      if (!project.supabase_project_ref || !project.supabase_token_encrypted) {
        return reply.status(400).send({ error: 'Project is not connected to Supabase' });
      }

      const vaultKey = app.vault.requireKey();
      let token: string;
      try {
        token = decrypt(
          { ciphertext: project.supabase_token_encrypted, iv: project.supabase_token_iv, authTag: project.supabase_token_auth_tag },
          vaultKey
        );
      } catch {
        return reply.status(400).send({ error: 'Failed to decrypt Supabase token — vault key may have changed' });
      }

      const result = await syncProject(app.db, vaultKey, req.params.projectId, project.supabase_project_ref, token);

      logAudit(app.db, 'supabase_synced', 'project', req.params.projectId, project.name, {
        updated: result.updated,
        unchanged: result.unchanged,
      });

      return result;
    }
  );

  // GET /supabase/status/:projectId — connection status
  app.get<{ Params: { projectId: string } }>(
    '/supabase/status/:projectId',
    async (req, reply) => {
      const project = app.db.prepare(
        'SELECT supabase_project_ref, supabase_last_sync, supabase_token_encrypted, supabase_token_iv, supabase_token_auth_tag FROM projects WHERE id = ?'
      ).get(req.params.projectId) as any;
      if (!project) return reply.status(404).send({ error: 'Project not found' });

      const connected = !!(project.supabase_project_ref && project.supabase_token_encrypted);

      if (!connected) {
        return { connected: false, projectRef: '', projectName: '', region: '', lastSync: null };
      }

      // Try to get project name/region from Supabase (cached via lastSync)
      let projectName = '';
      let region = '';
      try {
        const vaultKey = app.vault.requireKey();
        const token = decrypt(
          { ciphertext: project.supabase_token_encrypted, iv: project.supabase_token_iv, authTag: project.supabase_token_auth_tag },
          vaultKey
        );
        const sbProject = await supabaseFetch(`/v1/projects/${project.supabase_project_ref}`, token);
        projectName = sbProject.name || '';
        region = sbProject.region || '';
      } catch {
        // Token may be expired — still report as connected but with empty name
      }

      return {
        connected,
        projectRef: project.supabase_project_ref,
        projectName,
        region,
        lastSync: project.supabase_last_sync,
      };
    }
  );

  // POST /supabase/projects — list Supabase projects (for connect flow picker)
  app.post<{ Body: { accessToken: string } }>(
    '/supabase/projects',
    async (req, reply) => {
      const { accessToken } = req.body;
      try {
        const projects = await supabaseFetch('/v1/projects', accessToken);
        return projects;
      } catch (err: any) {
        return reply.status(400).send({ error: err.message });
      }
    }
  );

  // POST /supabase/organizations — list orgs so the connect flow can drill down
  // org → project. Picking the org first prevents grabbing a same-named project
  // (e.g. a fork) from the wrong organization.
  app.post<{ Body: { accessToken: string } }>(
    '/supabase/organizations',
    async (req, reply) => {
      const { accessToken } = req.body;
      try {
        const orgs = await supabaseFetch('/v1/organizations', accessToken);
        return orgs;
      } catch (err: any) {
        return reply.status(400).send({ error: err.message });
      }
    }
  );

  // GET /supabase/detect/:projectId — sniff the local project folder so the
  // connect UI can pre-select Vite / Next.js / plain env-var styles.
  app.get<{ Params: { projectId: string } }>(
    '/supabase/detect/:projectId',
    async (req, reply) => {
      const project = app.db.prepare('SELECT path FROM projects WHERE id = ?').get(req.params.projectId) as any;
      if (!project) return reply.status(404).send({ error: 'Project not found' });
      return { styles: detectEnvStyles(project.path) };
    }
  );
}

/**
 * One-time repair: clear secrets whose stored value is a SHA-256 digest
 * left behind by the old (broken) edge-secrets sync. We identify them by
 * source='supabase' + a 64-char lowercase hex string. Safe to run repeatedly.
 * Returns the number of rows removed.
 */
export function repairCorruptedSupabaseSecrets(db: any, vaultKey: Buffer): number {
  const rows = db.prepare(
    "SELECT id, value_encrypted, iv, auth_tag FROM secrets WHERE source = 'supabase'"
  ).all() as any[];

  const hexRe = /^[a-f0-9]{64}$/;
  let removed = 0;

  for (const row of rows) {
    try {
      const value = decrypt(
        { ciphertext: row.value_encrypted, iv: row.iv, authTag: row.auth_tag },
        vaultKey
      );
      if (hexRe.test(value)) {
        db.prepare('DELETE FROM secrets WHERE id = ?').run(row.id);
        removed++;
      }
    } catch {
      // Can't decrypt — leave it alone
    }
  }

  return removed;
}

/**
 * Run auto-sync for all linked Supabase projects.
 * Called after vault unlock. Non-blocking — errors are swallowed.
 */
export async function autoSyncSupabase(db: any, vaultKey: Buffer): Promise<void> {
  // Repair any corrupted secrets from the old broken edge-secrets sync
  try {
    const removed = repairCorruptedSupabaseSecrets(db, vaultKey);
    if (removed > 0) {
      console.log(`[supabase] Repaired ${removed} hash-corrupted secret(s)`);
    }
  } catch {
    // Non-fatal
  }

  const projects = db.prepare(
    "SELECT id, supabase_project_ref, supabase_last_sync, supabase_token_encrypted, supabase_token_iv, supabase_token_auth_tag FROM projects WHERE supabase_project_ref != '' AND supabase_token_encrypted IS NOT NULL AND archived = 0"
  ).all() as any[];

  for (const project of projects) {
    // Skip if synced less than 5 minutes ago
    if (project.supabase_last_sync) {
      const lastSync = new Date(project.supabase_last_sync).getTime();
      if (Date.now() - lastSync < 5 * 60 * 1000) continue;
    }

    try {
      const token = decrypt(
        { ciphertext: project.supabase_token_encrypted, iv: project.supabase_token_iv, authTag: project.supabase_token_auth_tag },
        vaultKey
      );
      await syncProject(db, vaultKey, project.id, project.supabase_project_ref, token);
    } catch {
      // Auto-sync failures are silent — don't block unlock
    }
  }
}
