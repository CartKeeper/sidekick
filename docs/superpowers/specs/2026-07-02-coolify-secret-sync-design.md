# Coolify Secret Sync — Design

**Date:** 2026-07-02
**Status:** Approved, pending implementation plan
**Author:** Jason Borst + Claude

## 1. Purpose

Add a "Connect Coolify" integration to SideKick that pulls a self-hosted Coolify
resource's environment variables into a SideKick project — the direct analog of the
existing Supabase Cloud sync, but for self-hosted stacks running on Coolify.

Users self-host Supabase stacks (and static sites / apps) on a Coolify box instead of
Supabase Cloud. Those stacks are not Cloud projects, so the Supabase sync cannot reach
them. Each Coolify resource (a Supabase "service" or an "application") owns its own env
vars — anon key, service_role key, JWT secret, DB password, etc. — which are exactly the
values a user wants vaulted in SideKick.

**Every project gets the capability; it is off until connected.** Nothing is enabled by
default.

## 2. Scope decisions

- **Cloudflare Access:** include optional CF Access service-token fields
  (`CF-Access-Client-Id` / `CF-Access-Client-Secret`), sent alongside the Bearer token,
  because the target instance (`coolify.theoddstackapps.com`) is reachable through a
  Cloudflare Tunnel and is likely gated by Cloudflare Access. Also surface a friendly
  error when a `401/403 + HTML login page` is detected.
- **Sync trigger:** manual only. Connect + on-demand "Sync Now" / re-sync button. No
  background auto-sync on vault unlock (this is where it diverges from the Supabase
  feature, which has `autoSyncSupabase`).
- **Mutual exclusivity:** treat Coolify and Supabase sync as independent integrations
  sharing the same "sync → write secrets → stamp last_sync" plumbing. A project may in
  practice have connected one and later the other; they do not interfere at the storage
  layer (different `source` tags, different columns).

## 3. Architecture

Mirrors the Supabase feature exactly:

- Sync logic runs in the **Fastify server child process** (not Electron main, not the
  browser). New file `src/server/routes/coolify.ts`, mirroring
  `src/server/routes/supabase.ts`.
- Storage is **SQLite** (`src/core/db.ts`), new nullable columns added via runtime
  `ALTER TABLE` migrations in the same block as the `supabase_*` columns.
- Encryption reuses `src/core/crypto.ts` (AES-256-GCM, vault key derived at unlock,
  held on `app.vault`) unchanged.
- The web frontend (`src/web/src/components/SecretsTab.tsx`) triggers everything over
  HTTP via `src/web/src/api/client.ts` (`api.coolify.*`).
- **No Electron main or MCP changes** are required. MCP `update_project` uses a fixed
  Zod allowlist and does not touch these columns; only the Fastify route writes them.

## 4. Data model

New nullable columns on the `projects` table (via `ALTER TABLE` migrations in
`getDb()`, alongside the `supabase_*` migrations):

| Column | Type | Notes |
|---|---|---|
| `coolify_instance_url` | TEXT | e.g. `https://coolify.theoddstackapps.com` (no trailing slash). Base for `/api/v1`. |
| `coolify_api_token_encrypted` | TEXT | Coolify API token, AES-256-GCM encrypted at rest. |
| `coolify_api_token_iv` | TEXT | GCM IV (hex). |
| `coolify_api_token_auth_tag` | TEXT | GCM auth tag (hex). |
| `coolify_cf_access_client_id` | TEXT | Cloudflare Access service-token client id (plaintext — it is an identifier, not a secret). Nullable. |
| `coolify_cf_access_secret_encrypted` | TEXT | Cloudflare Access service-token secret, encrypted at rest. Nullable. |
| `coolify_cf_access_secret_iv` | TEXT | GCM IV (hex). Nullable. |
| `coolify_cf_access_secret_auth_tag` | TEXT | GCM auth tag (hex). Nullable. |
| `coolify_resource_type` | TEXT | `service` \| `application`. |
| `coolify_resource_uuid` | TEXT | The Coolify resource UUID. |
| `coolify_resource_name` | TEXT | Cached display name (e.g. `annab-supabase`). |
| `coolify_target_environment` | TEXT | SideKick environment to write into. Default `prod`. |
| `coolify_sync_mode` | TEXT | `merge` \| `overwrite`. Default `merge`. |
| `coolify_last_sync` | TEXT | ISO timestamp, set on each successful sync. |

**Secrets `source` tag:** the `secrets` table already has a `source` column
(`manual` | `supabase`). Coolify-synced secrets use `source = 'coolify'`. No schema
change needed (it is a free-text TEXT column).

Sync-mode semantics:

- **`merge`** (default): upsert each incoming key. Never delete any secret. Only
  overwrite secrets already tagged `source='coolify'`; a key that collides with a
  `source='manual'` secret is skipped (mirrors the Supabase conflict rule).
- **`overwrite`**: within the target environment, delete existing `source='coolify'`
  secrets, then insert the fresh set. **Never touches `source='manual'` secrets** — it
  cannot delete user-authored data.

## 5. `src/server/routes/coolify.ts`

Mirrors `src/server/routes/supabase.ts`.

Helpers:

- `coolifyFetch(instanceUrl, token, path, cfHeaders?)` — single HTTP helper. Sends
  `Authorization: Bearer <token>`, `Accept: application/json`, and, when present,
  `CF-Access-Client-Id` / `CF-Access-Client-Secret`. Base URL is
  `${instanceUrl}/api/v1`. On a non-2xx response, if the status is `401/403` and the
  body looks like an HTML login page, throw the friendly Cloudflare Access error:
  _"Coolify is behind Cloudflare Access — add a service token or an Access bypass for
  `/api/*`."_ Otherwise throw `Coolify <path> -> <status> <text>`.
- `listCoolifyResources(instanceUrl, token, cf?)` — `GET /services` and
  `GET /applications` in parallel, returns
  `[{ type: 'service'|'application', uuid, name }]`.
- `fetchCoolifyEnv(instanceUrl, token, resourceType, uuid, cf?)` — `GET` the resource's
  `/envs`, returns `Record<string,string>` where each value is
  `real_value` when non-empty, else `value`, else `""`. **Never** vaults the literal
  `${...}` reference.
- `detectType(key)` — reuse the Supabase classifier (or a shared copy): keys matching
  `/(PASSWORD|SECRET|_KEY$|JWT|TOKEN|SERVICE_ROLE)/i` → `secret`; URLs →
  `connection`/`url`; else `generic`.
- `syncProject(db, vaultKey, projectId)` — load the project's `coolify_*` config,
  decrypt the API token and (if present) the CF Access secret, `fetchCoolifyEnv`, then
  upsert into the target environment's secrets tagged `source='coolify'` per the sync
  mode. Encrypt each value with the vault key inline (same pattern as the Supabase
  `syncProject`). Stamp `coolify_last_sync`. Return `{ synced, skippedEmpty }`.

Route handlers under `/api/coolify` (all behind the vault-lock `preHandler`):

- `POST /api/coolify/test` — validate connectivity + token given instance URL / token /
  optional CF headers (does not persist). Returns ok / friendly error.
- `POST /api/coolify/resources` — `listCoolifyResources` for the picker, grouped
  service vs application.
- `POST /api/coolify/connect/:projectId` — encrypt + store config, run initial sync.
- `POST /api/coolify/sync/:projectId` — manual re-sync.
- `GET /api/coolify/status/:projectId` — connected?, resource name/type, last sync,
  synced count.
- `POST /api/coolify/disconnect/:projectId` — clear the `coolify_*` columns. (Does not
  delete already-synced secrets by default; behavior mirrors the Supabase disconnect.)

**No `autoSyncCoolify`** and **no `auth.ts` change** — manual only.

Register the route plugin in `src/server/index.ts` alongside the Supabase route.

## 6. Web frontend

`src/web/src/api/client.ts` — add an `api.coolify.*` object (test, resources, connect,
sync, status, disconnect) plus `CoolifyStatus`, `CoolifyResource`, `CoolifySyncResult`
types, mirroring `api.supabase.*`.

`src/web/src/components/SecretsTab.tsx` — add a "Connect Coolify" block, structurally
the twin of the Supabase block:

1. Fields: **Instance URL**, **API token** (masked), optional **CF Access Client Id** /
   **Client Secret** (masked), then **Test connection**.
2. On success, a **resource picker** grouped by Service vs Application, plus **target
   environment** and **sync mode** (merge/overwrite) selectors.
3. **Connect & Sync** persists the encrypted config and runs the initial sync, showing
   `X secrets synced • last sync <time>`.
4. Connected card: secret count, last-sync time, **Sync Now** (re-sync), **Disconnect**.
5. A bare `?` help icon (Ionicons `help-circle-outline`, no filled background) with
   contextual guidance, per the mandatory per-page help-icon rule.

Times display in `America/New_York`, 12-hour AM/PM.

## 7. Security

- Encrypt `coolify_api_token` and the CF Access secret at rest (same AES-256-GCM scheme
  as `supabase_token_encrypted`).
- Never log `real_value` / secret values — log key names + counts only.
- Sync is strictly read-only against Coolify (only GET). Never write back to Coolify.
- Default `merge` so a sync can never delete user-authored secrets; `overwrite` only
  ever removes `source='coolify'` secrets.

## 8. Test checklist

- [ ] Connect with a valid token → resources picker lists services + applications.
- [ ] Sync a Supabase **service** → anon/service/JWT/DB values land as **resolved**
      (`real_value`), not `${...}` refs.
- [ ] A key whose `value` is `${SERVICE_PASSWORD_JWT}` stores the resolved secret.
- [ ] Sync an **application** (static site) → its envs import.
- [ ] `merge` keeps manually-added keys; `overwrite` replaces only the `coolify` set.
- [ ] Re-sync updates `coolify_last_sync` and changed values.
- [ ] Instance behind Cloudflare Access without a service token → clear, actionable
      error.
- [ ] Instance behind Cloudflare Access **with** a valid service token → sync succeeds.
- [ ] Token + CF secret stored encrypted; secret values never appear in logs.

## 9. Coolify API reference

Base URL: `{coolify_instance_url}/api/v1`. Auth: `Authorization: Bearer {token}` on
every call. `Accept: application/json` for reads.

| Purpose | Method + path |
|---|---|
| List services | `GET /services` |
| List applications | `GET /applications` |
| Service env vars | `GET /services/{uuid}/envs` |
| Application env vars | `GET /applications/{uuid}/envs` |

Env object shape: `{ uuid, key, value, real_value, is_shown_once, ... }`. Coolify uses
`${VAR}` magic-variable interpolation; `value` may be a `${...}` ref, the resolved
secret is in `real_value`. **Always prefer `real_value` when non-empty; fall back to
`value`.**
