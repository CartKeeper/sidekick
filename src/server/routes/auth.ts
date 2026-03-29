// src/server/routes/auth.ts
import type { FastifyInstance } from 'fastify';
import { getConfig, setConfig, logAudit } from '../../core/db.js';
import {
  generateSalt,
  deriveKey,
  hashPassword,
  verifyPassword,
  encrypt,
  decrypt,
} from '../../core/crypto.js';
import { storeInKeychain } from '../../core/keychain.js';

export async function authRoutes(app: FastifyInstance) {
  app.get('/status', async () => {
    const hash = getConfig(app.db, 'password_hash');
    return {
      needsSetup: !hash,
      isLocked: !app.vault.getKey(),
      keychainEnabled: getConfig(app.db, 'keychain_enabled') === 'true',
    };
  });

  app.post<{ Body: { password: string; enableKeychain: boolean } }>('/setup', async (req, reply) => {
    const hash = getConfig(app.db, 'password_hash');
    if (hash) {
      return reply.status(400).send({ error: 'Vault already set up' });
    }

    const { password, enableKeychain } = req.body;
    const salt = generateSalt();
    const passwordHash = await hashPassword(password);
    const key = deriveKey(password, salt);

    setConfig(app.db, 'password_hash', passwordHash);
    setConfig(app.db, 'encryption_salt', salt);
    setConfig(app.db, 'keychain_enabled', String(enableKeychain));

    if (enableKeychain) {
      storeInKeychain(password);
    }

    setConfig(app.db, 'default_environments', JSON.stringify(['Dev', 'Staging', 'Prod']));
    app.vault.setKey(key);
    return { success: true };
  });

  app.post<{ Body: { password: string } }>('/unlock', async (req, reply) => {
    const storedHash = getConfig(app.db, 'password_hash');
    if (!storedHash) {
      return reply.status(400).send({ error: 'Vault not set up' });
    }

    const { password } = req.body;
    const valid = await verifyPassword(password, storedHash);
    if (!valid) {
      return reply.status(401).send({ error: 'Invalid password' });
    }

    const salt = getConfig(app.db, 'encryption_salt')!;
    const key = deriveKey(password, salt);
    app.vault.setKey(key);
    return { success: true };
  });

  app.post('/lock', async () => {
    app.vault.setKey(null);
    return { success: true };
  });

  app.post<{ Body: { currentPassword: string; newPassword: string } }>(
    '/change-password',
    async (req, reply) => {
      const { currentPassword, newPassword } = req.body;

      const storedHash = getConfig(app.db, 'password_hash')!;
      const valid = await verifyPassword(currentPassword, storedHash);
      if (!valid) {
        return reply.status(401).send({ error: 'Invalid current password' });
      }

      const oldSalt = getConfig(app.db, 'encryption_salt')!;
      const oldKey = deriveKey(currentPassword, oldSalt);

      const newSalt = generateSalt();
      const newKey = deriveKey(newPassword, newSalt);
      const newHash = await hashPassword(newPassword);

      const secrets = app.db
        .prepare('SELECT id, value_encrypted, iv, auth_tag FROM secrets')
        .all() as { id: string; value_encrypted: string; iv: string; auth_tag: string }[];

      const updateStmt = app.db.prepare(
        "UPDATE secrets SET value_encrypted = ?, iv = ?, auth_tag = ?, updated_at = datetime('now') WHERE id = ?"
      );

      const reEncrypt = app.db.transaction(() => {
        for (const secret of secrets) {
          const plaintext = decrypt(
            { ciphertext: secret.value_encrypted, iv: secret.iv, authTag: secret.auth_tag },
            oldKey
          );
          const encrypted = encrypt(plaintext, newKey);
          updateStmt.run(encrypted.ciphertext, encrypted.iv, encrypted.authTag, secret.id);
        }

        setConfig(app.db, 'password_hash', newHash);
        setConfig(app.db, 'encryption_salt', newSalt);
      });

      reEncrypt();
      app.vault.setKey(newKey);

      if (getConfig(app.db, 'keychain_enabled') === 'true') {
        storeInKeychain(newPassword);
      }

      logAudit(app.db, 'password_changed', 'vault', 'vault', 'vault', {
        secretsReEncrypted: secrets.length,
      });

      return { success: true };
    }
  );
}
