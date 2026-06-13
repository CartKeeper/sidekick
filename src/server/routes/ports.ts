// src/server/routes/ports.ts
import type { FastifyInstance } from 'fastify';
import { spawnSync } from 'node:child_process';

export interface PortEntry {
  address: string;
  port: number;
  protocol: 'TCP';
}

export interface PortListener {
  pid: number;
  command: string;
  fullCommand: string;
  user: string;
  ports: PortEntry[];
}

function listListeners(): PortListener[] {
  const lsof = spawnSync('lsof', ['-iTCP', '-sTCP:LISTEN', '-P', '-n'], { encoding: 'utf8' });
  if (lsof.status !== 0 && !lsof.stdout) return [];

  const lines = lsof.stdout.split('\n').slice(1);
  const byPid = new Map<number, PortListener>();
  const seen = new Set<string>();

  for (const line of lines) {
    if (!line.trim()) continue;
    const cols = line.trim().split(/\s+/);
    if (cols.length < 9) continue;
    const command = cols[0];
    const pid = parseInt(cols[1], 10);
    const user = cols[2];
    const name = cols[8];
    if (Number.isNaN(pid)) continue;
    const lastColon = name.lastIndexOf(':');
    if (lastColon < 0) continue;
    const address = name.slice(0, lastColon);
    const port = parseInt(name.slice(lastColon + 1), 10);
    if (Number.isNaN(port)) continue;

    const key = `${pid}:${port}`;
    if (seen.has(key)) continue;
    seen.add(key);

    let entry = byPid.get(pid);
    if (!entry) {
      entry = { pid, command, fullCommand: command, user, ports: [] };
      byPid.set(pid, entry);
    }
    entry.ports.push({ address, port, protocol: 'TCP' });
  }

  // Resolve full command lines for each PID
  for (const entry of byPid.values()) {
    const ps = spawnSync('ps', ['-p', String(entry.pid), '-o', 'command='], { encoding: 'utf8' });
    if (ps.status === 0) {
      const full = ps.stdout.trim();
      if (full) entry.fullCommand = full;
    }
    entry.ports.sort((a, b) => a.port - b.port);
  }

  return Array.from(byPid.values()).sort((a, b) => {
    const aMin = a.ports[0]?.port ?? Infinity;
    const bMin = b.ports[0]?.port ?? Infinity;
    return aMin - bMin;
  });
}

export async function portsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', async (_req, reply) => {
    try {
      app.vault.requireKey();
    } catch {
      return reply.status(403).send({ error: 'Vault is locked' });
    }
  });

  app.get('/ports', async () => {
    return { listeners: listListeners() };
  });

  app.delete<{ Params: { pid: string }; Querystring: { force?: string } }>(
    '/ports/:pid',
    async (req, reply) => {
      const pidNum = parseInt(req.params.pid, 10);
      if (Number.isNaN(pidNum) || pidNum <= 1) {
        return reply.status(400).send({ error: 'Invalid PID' });
      }
      if (pidNum === process.pid) {
        return reply.status(400).send({ error: 'Refusing to kill Sidekick itself' });
      }
      const signal: NodeJS.Signals = req.query?.force === 'true' ? 'SIGKILL' : 'SIGTERM';
      try {
        process.kill(pidNum, signal);
        return { success: true, signal };
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to kill process';
        return reply.status(500).send({ error: msg });
      }
    }
  );
}
