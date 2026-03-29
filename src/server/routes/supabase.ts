// src/server/routes/supabase.ts
import type { FastifyInstance } from 'fastify';

export async function supabaseRoutes(app: FastifyInstance) {
  // Vault lock guard
  app.addHook('preHandler', async (_req, reply) => {
    try {
      app.vault.requireKey();
    } catch {
      return reply.status(403).send({ error: 'Vault is locked' });
    }
  });

  // POST /supabase/projects — list Supabase projects using access token
  app.post<{ Body: { accessToken: string } }>(
    '/supabase/projects',
    async (req, reply) => {
      const { accessToken } = req.body;
      try {
        const res = await fetch('https://api.supabase.com/v1/projects', {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!res.ok) {
          const err = await res.text();
          return reply.status(res.status).send({ error: `Supabase API error: ${err}` });
        }
        const projects = await res.json();
        return projects;
      } catch (err: any) {
        return reply.status(500).send({ error: err.message });
      }
    }
  );

  // POST /supabase/keys — get API keys for a specific Supabase project
  app.post<{ Body: { accessToken: string; projectRef: string } }>(
    '/supabase/keys',
    async (req, reply) => {
      const { accessToken, projectRef } = req.body;
      try {
        const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/api-keys`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!res.ok) {
          const err = await res.text();
          return reply.status(res.status).send({ error: `Supabase API error: ${err}` });
        }
        const keys = await res.json();

        // Build a structured result with common env var names
        const result: Record<string, string> = {
          SUPABASE_URL: `https://${projectRef}.supabase.co`,
          NEXT_PUBLIC_SUPABASE_URL: `https://${projectRef}.supabase.co`,
        };

        for (const key of keys) {
          if (key.name === 'anon') {
            result.SUPABASE_ANON_KEY = key.api_key;
            result.NEXT_PUBLIC_SUPABASE_ANON_KEY = key.api_key;
          } else if (key.name === 'service_role') {
            result.SUPABASE_SERVICE_ROLE_KEY = key.api_key;
          }
        }

        return result;
      } catch (err: any) {
        return reply.status(500).send({ error: err.message });
      }
    }
  );
}
