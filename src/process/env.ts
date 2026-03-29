// src/process/env.ts
import { execSync } from 'node:child_process';

let resolvedPath: string | null = null;

/**
 * Get the full shell PATH by sourcing the user's shell profile.
 * This ensures we find executables installed via nvm, brew, etc.
 */
export function getShellPath(): string {
  if (resolvedPath) return resolvedPath;

  try {
    const shell = process.env.SHELL || '/bin/zsh';
    resolvedPath = execSync(`${shell} -ilc 'echo $PATH'`, {
      encoding: 'utf8',
      timeout: 5000,
    }).trim();
  } catch {
    resolvedPath = process.env.PATH || '/usr/local/bin:/usr/bin:/bin';
  }

  return resolvedPath;
}

/**
 * Build the full environment for a child process:
 * - Start with current process env
 * - Override PATH with resolved shell PATH
 * - Inject secrets as env vars
 */
export function buildProcessEnv(secrets: Record<string, string> = {}): NodeJS.ProcessEnv {
  return {
    ...process.env,
    PATH: getShellPath(),
    ...secrets,
  };
}
