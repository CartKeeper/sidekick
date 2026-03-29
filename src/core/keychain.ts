import { execFileSync } from 'node:child_process';

const SERVICE = 'sidekick-vault';
const ACCOUNT = 'master-password';

export function storeInKeychain(password: string): boolean {
  try {
    execFileSync('security', [
      'add-generic-password',
      '-s', SERVICE,
      '-a', ACCOUNT,
      '-w', password,
      '-U',
    ]);
    return true;
  } catch {
    return false;
  }
}

export function readFromKeychain(): string | null {
  try {
    const result = execFileSync('security', [
      'find-generic-password',
      '-s', SERVICE,
      '-a', ACCOUNT,
      '-w',
    ]);
    return result.toString().trim();
  } catch {
    return null;
  }
}

export function removeFromKeychain(): boolean {
  try {
    execFileSync('security', [
      'delete-generic-password',
      '-s', SERVICE,
      '-a', ACCOUNT,
    ]);
    return true;
  } catch {
    return false;
  }
}
