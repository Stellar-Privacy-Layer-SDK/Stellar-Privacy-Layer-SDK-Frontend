import type { StorageProvider } from '../types';

const STORAGE_PREFIX = 'stellar-privacy:';

/**
 * localStorage-backed storage provider. Fails gracefully (returns null /
 * no-ops) when storage is unavailable, e.g. in private browsing modes.
 */
export function createLocalStorageProvider(): StorageProvider {
  return {
    async get(key: string): Promise<string | null> {
      try {
        return localStorage.getItem(STORAGE_PREFIX + key);
      } catch {
        // storage unavailable — treat as missing
        return null;
      }
    },
    async set(key: string, value: string): Promise<void> {
      try {
        localStorage.setItem(STORAGE_PREFIX + key, value);
      } catch {
        // storage full or unavailable — persistence is best-effort
      }
    },
    async remove(key: string): Promise<void> {
      try {
        localStorage.removeItem(STORAGE_PREFIX + key);
      } catch {
        // storage unavailable
      }
    },
  };
}

/**
 * In-memory storage provider (useful for tests and non-browser runtimes).
 */
export function createMemoryStorageProvider(): StorageProvider {
  const store = new Map<string, string>();
  return {
    async get(key: string): Promise<string | null> {
      return store.get(key) ?? null;
    },
    async set(key: string, value: string): Promise<void> {
      store.set(key, value);
    },
    async remove(key: string): Promise<void> {
      store.delete(key);
    },
  };
}
