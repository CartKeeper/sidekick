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
