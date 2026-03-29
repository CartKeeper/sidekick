// src/server/state.ts
export interface VaultState {
  getKey(): Buffer | null;
  setKey(key: Buffer | null): void;
  requireKey(): Buffer;
}

export function createVaultState(): VaultState {
  let _key: Buffer | null = null;

  return {
    getKey() {
      return _key;
    },
    setKey(key: Buffer | null) {
      if (_key) _key.fill(0);
      _key = key;
    },
    requireKey(): Buffer {
      if (!_key) throw new Error('Vault is locked');
      return _key;
    },
  };
}
