import { describe, it, expect, vi, beforeEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { storeInKeychain, readFromKeychain, removeFromKeychain } from '../../core/keychain.js';

vi.mock('node:child_process', () => ({
  execFileSync: vi.fn(),
}));

const mockExec = vi.mocked(execFileSync);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('keychain', () => {
  describe('storeInKeychain', () => {
    it('calls security add-generic-password with correct args', () => {
      mockExec.mockReturnValue(Buffer.from(''));
      const result = storeInKeychain('my-password');
      expect(result).toBe(true);
      expect(mockExec).toHaveBeenCalledWith('security', [
        'add-generic-password',
        '-s', 'sidekick-vault',
        '-a', 'master-password',
        '-w', 'my-password',
        '-U',
      ]);
    });

    it('returns false on error', () => {
      mockExec.mockImplementation(() => {
        throw new Error('keychain locked');
      });
      const result = storeInKeychain('pw');
      expect(result).toBe(false);
    });
  });

  describe('readFromKeychain', () => {
    it('returns the stored password', () => {
      mockExec.mockReturnValue(Buffer.from('my-password\n'));
      const result = readFromKeychain();
      expect(result).toBe('my-password');
      expect(mockExec).toHaveBeenCalledWith('security', [
        'find-generic-password',
        '-s', 'sidekick-vault',
        '-a', 'master-password',
        '-w',
      ]);
    });

    it('returns null on error', () => {
      mockExec.mockImplementation(() => {
        throw new Error('not found');
      });
      expect(readFromKeychain()).toBeNull();
    });
  });

  describe('removeFromKeychain', () => {
    it('calls security delete-generic-password', () => {
      mockExec.mockReturnValue(Buffer.from(''));
      const result = removeFromKeychain();
      expect(result).toBe(true);
      expect(mockExec).toHaveBeenCalledWith('security', [
        'delete-generic-password',
        '-s', 'sidekick-vault',
        '-a', 'master-password',
      ]);
    });

    it('returns false on error', () => {
      mockExec.mockImplementation(() => {
        throw new Error('not found');
      });
      expect(removeFromKeychain()).toBe(false);
    });
  });
});
