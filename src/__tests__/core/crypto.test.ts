import { describe, it, expect } from 'vitest';
import {
  generateSalt,
  deriveKey,
  encrypt,
  decrypt,
  hashPassword,
  verifyPassword,
} from '../../core/crypto.js';

describe('crypto', () => {
  describe('generateSalt', () => {
    it('returns a 64-char hex string (32 bytes)', () => {
      const salt = generateSalt();
      expect(salt).toHaveLength(64);
      expect(salt).toMatch(/^[0-9a-f]{64}$/);
    });

    it('generates unique salts', () => {
      const a = generateSalt();
      const b = generateSalt();
      expect(a).not.toBe(b);
    });
  });

  describe('deriveKey', () => {
    it('returns a 32-byte Buffer', () => {
      const salt = generateSalt();
      const key = deriveKey('password123', salt);
      expect(key).toBeInstanceOf(Buffer);
      expect(key.length).toBe(32);
    });

    it('produces the same key for the same password and salt', () => {
      const salt = generateSalt();
      const key1 = deriveKey('mypassword', salt);
      const key2 = deriveKey('mypassword', salt);
      expect(key1.equals(key2)).toBe(true);
    });

    it('produces different keys for different passwords', () => {
      const salt = generateSalt();
      const key1 = deriveKey('password1', salt);
      const key2 = deriveKey('password2', salt);
      expect(key1.equals(key2)).toBe(false);
    });
  });

  describe('encrypt / decrypt', () => {
    it('round-trips plaintext through encrypt then decrypt', () => {
      const salt = generateSalt();
      const key = deriveKey('test-password', salt);
      const plaintext = 'super-secret-api-key-12345';

      const encrypted = encrypt(plaintext, key);
      expect(encrypted).toHaveProperty('ciphertext');
      expect(encrypted).toHaveProperty('iv');
      expect(encrypted).toHaveProperty('authTag');
      expect(encrypted.ciphertext).not.toBe(plaintext);

      const decrypted = decrypt(encrypted, key);
      expect(decrypted).toBe(plaintext);
    });

    it('produces different ciphertexts for the same plaintext (unique IV)', () => {
      const key = deriveKey('pw', generateSalt());
      const a = encrypt('same-text', key);
      const b = encrypt('same-text', key);
      expect(a.ciphertext).not.toBe(b.ciphertext);
      expect(a.iv).not.toBe(b.iv);
    });

    it('throws on tampered ciphertext', () => {
      const key = deriveKey('pw', generateSalt());
      const encrypted = encrypt('secret', key);
      encrypted.ciphertext = 'deadbeef' + encrypted.ciphertext.slice(8);
      expect(() => decrypt(encrypted, key)).toThrow();
    });

    it('throws with wrong key', () => {
      const salt = generateSalt();
      const key1 = deriveKey('right-password', salt);
      const key2 = deriveKey('wrong-password', salt);
      const encrypted = encrypt('secret', key1);
      expect(() => decrypt(encrypted, key2)).toThrow();
    });

    it('handles empty string', () => {
      const key = deriveKey('pw', generateSalt());
      const encrypted = encrypt('', key);
      expect(decrypt(encrypted, key)).toBe('');
    });

    it('handles unicode', () => {
      const key = deriveKey('pw', generateSalt());
      const text = 'Hello from Sidekick';
      const encrypted = encrypt(text, key);
      expect(decrypt(encrypted, key)).toBe(text);
    });
  });

  describe('hashPassword / verifyPassword', () => {
    it('hashes and verifies a password', async () => {
      const hash = await hashPassword('my-master-password');
      expect(hash).toBeTruthy();
      expect(hash).not.toBe('my-master-password');
      expect(await verifyPassword('my-master-password', hash)).toBe(true);
    });

    it('rejects wrong password', async () => {
      const hash = await hashPassword('correct');
      expect(await verifyPassword('wrong', hash)).toBe(false);
    });
  });
});
