// src/process/env.ts
import { execSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

let resolvedPath: string | null = null;

function hasNodeOnPath(pathStr: string): boolean {
  for (const dir of pathStr.split(':')) {
    if (!dir) continue;
    if (existsSync(join(dir, 'npm')) || existsSync(join(dir, 'node'))) return true;
  }
  return false;
}

// Detect nvm's bin dir directly from ~/.nvm. Used when shell sourcing fails or
// returns a PATH without node — common when Sidekick is launched as a packaged
// .app from Finder/Dock, where launchd hands the process a minimal PATH.
function detectNvmBinDir(): string | null {
  const nvmDir = join(homedir(), '.nvm');
  const versionsDir = join(nvmDir, 'versions', 'node');
  if (!existsSync(versionsDir)) return null;

  try {
    const aliasFile = join(nvmDir, 'alias', 'default');
    if (existsSync(aliasFile)) {
      const alias = readFileSync(aliasFile, 'utf8').trim();
      const name = alias.startsWith('v') ? alias : `v${alias}`;
      const candidate = join(versionsDir, name, 'bin');
      if (existsSync(candidate)) return candidate;
    }
  } catch {
    // fall through to glob
  }

  try {
    const versions = readdirSync(versionsDir)
      .filter((v) => /^v\d+\.\d+\.\d+/.test(v))
      .sort((a, b) => {
        const pa = a.slice(1).split('.').map(Number);
        const pb = b.slice(1).split('.').map(Number);
        for (let i = 0; i < 3; i++) {
          const da = pa[i] ?? 0;
          const db = pb[i] ?? 0;
          if (da !== db) return db - da;
        }
        return 0;
      });
    for (const v of versions) {
      const candidate = join(versionsDir, v, 'bin');
      if (existsSync(candidate)) return candidate;
    }
  } catch {
    // ignore
  }

  return null;
}

// Source the user's shell profile in a non-interactive login shell, then echo
// PATH. We avoid `-i` (interactive) because Electron's main process has no tty
// and interactive zsh init (prompts, vcs_info, oh-my-zsh hooks) frequently
// throws in that context, sending us silently into the fallback.
function resolveViaShell(): string | null {
  const shell = process.env.SHELL || '/bin/zsh';
  const isZsh = /zsh$/.test(shell);
  const sourceCmd = isZsh
    ? '[ -f ~/.zshrc ] && . ~/.zshrc 2>/dev/null'
    : '[ -f ~/.bash_profile ] && . ~/.bash_profile 2>/dev/null; [ -f ~/.bashrc ] && . ~/.bashrc 2>/dev/null';

  try {
    const out = execSync(`${shell} -lc '${sourceCmd}; printf "SIDEKICK_PATH=%s\\n" "$PATH"'`, {
      encoding: 'utf8',
      timeout: 5000,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const lines = out.split('\n').filter((l) => l.startsWith('SIDEKICK_PATH='));
    const last = lines[lines.length - 1];
    if (last) {
      const value = last.slice('SIDEKICK_PATH='.length).trim();
      return value || null;
    }
  } catch {
    // fall through
  }
  return null;
}

/**
 * Resolve the PATH that should be handed to child processes. Tries the user's
 * shell profile first, then patches in nvm's bin dir if node is still missing.
 * Only caches a result that actually contains node, so a transient failure
 * (e.g. a slow shell init) doesn't poison the whole Sidekick session.
 */
export function getShellPath(): string {
  if (resolvedPath) return resolvedPath;

  let candidate = resolveViaShell();

  if (!candidate || !hasNodeOnPath(candidate)) {
    const nvmBin = detectNvmBinDir();
    if (nvmBin) {
      const base = candidate || process.env.PATH || '/usr/local/bin:/usr/bin:/bin';
      candidate = `${nvmBin}:${base}`;
    }
  }

  if (!candidate) {
    candidate = process.env.PATH || '/usr/local/bin:/usr/bin:/bin';
  }

  if (hasNodeOnPath(candidate)) {
    resolvedPath = candidate;
  }

  // Surface the resolved PATH so a missing-binary failure is debuggable instead
  // of silent. Goes to stderr → visible in Electron's terminal and Console.app.
  // eslint-disable-next-line no-console
  console.error('[sidekick] child PATH resolved:', candidate);

  return candidate;
}

/**
 * Build the full environment for a child process:
 * - Start with current process env
 * - Override PATH with resolved shell PATH
 * - Inject secrets as env vars
 */
export function buildProcessEnv(secrets: Record<string, string> = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PATH: getShellPath(),
  };

  // Strip Sidekick internals that would otherwise leak into child processes:
  // - PORT: set by Electron for Sidekick's own server; next/vite/etc. read it
  //   and grab Sidekick's port, colliding with Sidekick itself.
  // - SIDEKICK_PORT: same idea, used by the MCP server.
  // - ELECTRON_RUN_AS_NODE: forces children to run as plain Node, breaking
  //   anything that re-execs Electron (e.g. `npx electron`).
  delete env.PORT;
  delete env.SIDEKICK_PORT;
  delete env.ELECTRON_RUN_AS_NODE;

  // Project secrets win over inherited env (user can still set PORT explicitly).
  Object.assign(env, secrets);

  return env;
}
