import { StorageProvider } from '../types';

const STORAGE_PREFIX = 'stellar-privacy:';

export function createLocalStorageProvider(): StorageProvider {
  return {
    async get(key: string): Promise<string | null> {
      try {
        return localStorage.getItem(STORAGE_PREFIX + key);
      } catch {
        return null;
      }
    },
    async set(key: string, value: string): Promise<void> {
      try {
        localStorage.setItem(STORAGE_PREFIX + key, value);
      } catch {
        // storage full or unavailable
      }
    },
    async remove(key: string): Promise<void> {
      try {
        localStorage.removeItem(STORAGE_PREFIX + key);
      } catch {}
    },
  };
}

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
