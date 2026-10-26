// src/server/routes/auth.ts
import type { FastifyInstance } from 'fastify';
import { getConfig, setConfig, logAudit } from '../../core/db.js';
import { autoSyncSupabase } from './supabase.js';
import {
  generateSalt,
  deriveKey,
  hashPassword,
  verifyPassword,
  encrypt,
  decrypt,
} from '../../core/crypto.js';
import { storeInKeychain } from '../../core/keychain.js';

/** Encrypted token column groups on `projects` (`<prefix>_encrypted/_iv/_auth_tag`). */
const PROJECT_TOKEN_COLUMNS = ['supabase_token', 'coolify_api_token', 'coolify_cf_access_secret'] as const;

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

    // Auto-sync Supabase projects in background (non-blocking)
    autoSyncSupabase(app.db, key).catch(() => {});

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

        // Integration tokens stored on project rows are encrypted with the same key.
        for (const prefix of PROJECT_TOKEN_COLUMNS) {
          const rows = app.db
            .prepare(`SELECT id, ${prefix}_encrypted AS c, ${prefix}_iv AS iv, ${prefix}_auth_tag AS tag FROM projects WHERE ${prefix}_encrypted IS NOT NULL`)
            .all() as { id: string; c: string; iv: string; tag: string }[];
          const update = app.db.prepare(
            `UPDATE projects SET ${prefix}_encrypted = ?, ${prefix}_iv = ?, ${prefix}_auth_tag = ? WHERE id = ?`
          );
          for (const row of rows) {
            const plaintext = decrypt({ ciphertext: row.c, iv: row.iv, authTag: row.tag }, oldKey);
            const encrypted = encrypt(plaintext, newKey);
            update.run(encrypted.ciphertext, encrypted.iv, encrypted.authTag, row.id);
          }
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
