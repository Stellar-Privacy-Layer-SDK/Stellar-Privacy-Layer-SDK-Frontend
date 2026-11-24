import { logger } from './logger.js';
import type { StorageProvider } from '../types.js';

const STORAGE_PREFIX = 'stellar-privacy:';

/**
 * localStorage-backed storage provider. When localStorage rejects a write
 * (quota, private browsing) the value is kept in memory for the session and a
 * warning is logged, so reads stay consistent and the failure is visible.
 */
export function createLocalStorageProvider(): StorageProvider {
  const fallback = new Map<string, string>();
  const warn = (operation: string, key: string, error: unknown) =>
    logger.warn('localStorage operation failed', {
      operation,
      key,
      error: error instanceof Error ? error.message : String(error),
    });

  return {
    async get(key: string): Promise<string | null> {
      const pending = fallback.get(key);
      if (pending !== undefined) return pending;
      try {
        return localStorage.getItem(STORAGE_PREFIX + key);
      } catch (error) {
        warn('get', key, error);
        return null;
      }
    },
    async set(key: string, value: string): Promise<void> {
      try {
        localStorage.setItem(STORAGE_PREFIX + key, value);
        fallback.delete(key);
      } catch (error) {
        fallback.set(key, value);
        warn('set', key, error);
      }
    },
    async remove(key: string): Promise<void> {
      fallback.delete(key);
      try {
        localStorage.removeItem(STORAGE_PREFIX + key);
      } catch (error) {
        warn('remove', key, error);
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
