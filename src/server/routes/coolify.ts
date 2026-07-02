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
