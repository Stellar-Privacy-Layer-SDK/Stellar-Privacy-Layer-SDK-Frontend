import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createLocalStorageProvider, createMemoryStorageProvider } from './storage.js';
import { logger } from './logger.js';
import type { StorageProvider } from '../types.js';

function runStorageTests(label: string, createProvider: () => StorageProvider) {
  describe(label, () => {
    let storage: StorageProvider;

    beforeEach(() => {
      storage = createProvider();
    });

    it('returns null for missing keys', async () => {
      expect(await storage.get('nonexistent')).toBeNull();
    });

    it('stores and retrieves values', async () => {
      await storage.set('key1', 'value1');
      expect(await storage.get('key1')).toBe('value1');
    });

    it('overwrites existing values', async () => {
      await storage.set('key1', 'original');
      await storage.set('key1', 'updated');
      expect(await storage.get('key1')).toBe('updated');
    });

    it('removes values', async () => {
      await storage.set('key1', 'value1');
      await storage.remove('key1');
      expect(await storage.get('key1')).toBeNull();
    });

    it('handles multiple keys independently', async () => {
      await storage.set('keyA', 'valueA');
      await storage.set('keyB', 'valueB');
      expect(await storage.get('keyA')).toBe('valueA');
      expect(await storage.get('keyB')).toBe('valueB');
      await storage.remove('keyA');
      expect(await storage.get('keyA')).toBeNull();
      expect(await storage.get('keyB')).toBe('valueB');
    });

    it('handles empty string values', async () => {
      await storage.set('empty', '');
      expect(await storage.get('empty')).toBe('');
    });

    it('handles special characters', async () => {
      const special = '{"key": "value"}<script>alert(1)</script>\n\u2603';
      await storage.set('special', special);
      expect(await storage.get('special')).toBe(special);
    });

    it('remove of missing key does not throw', async () => {
      await expect(storage.remove('does_not_exist')).resolves.toBeUndefined();
    });

    it('supports large values', async () => {
      const large = 'x'.repeat(10000);
      await storage.set('large', large);
      expect(await storage.get('large')).toBe(large);
    });
  });
}

runStorageTests('MemoryStorageProvider', createMemoryStorageProvider);

describe('LocalStorageProvider', () => {
  let backing: Map<string, string>;
  let ls: {
    getItem: ReturnType<typeof vi.fn>;
    setItem: ReturnType<typeof vi.fn>;
    removeItem: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    backing = new Map();
    ls = {
      getItem: vi.fn((k: string) => backing.get(k) ?? null),
      setItem: vi.fn((k: string, v: string) => { backing.set(k, v); }),
      removeItem: vi.fn((k: string) => { backing.delete(k); }),
    };
    vi.stubGlobal('localStorage', ls);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses the stellar-privacy: key prefix', async () => {
    const storage = createLocalStorageProvider();
    await storage.set('k1', 'v1');
    expect(backing.get('stellar-privacy:k1')).toBe('v1');
    expect(await storage.get('k1')).toBe('v1');
  });

  it('removes with the prefix', async () => {
    const storage = createLocalStorageProvider();
    await storage.set('k1', 'v1');
    await storage.remove('k1');
    expect(backing.has('stellar-privacy:k1')).toBe(false);
  });

  it('keeps rejected writes for the session and logs a warning', async () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    const storage = createLocalStorageProvider();
    ls.setItem.mockImplementation(() => { throw new Error('quota exceeded'); });
    await storage.set('k', 'v');
    expect(await storage.get('k')).toBe('v');
    expect(warn).toHaveBeenCalledWith(
      'localStorage operation failed',
      expect.objectContaining({ operation: 'set', error: 'quota exceeded' }),
    );
    await storage.remove('k');
    expect(await storage.get('k')).toBeNull();
    warn.mockRestore();
  });

  it('survives storage failures without throwing', async () => {
    const storage = createLocalStorageProvider();
    ls.setItem.mockImplementation(() => { throw new Error('quota exceeded'); });
    await expect(storage.set('k', 'v')).resolves.toBeUndefined();

    ls.getItem.mockImplementation(() => { throw new Error('denied'); });
    expect(await storage.get('unset')).toBeNull();

    ls.removeItem.mockImplementation(() => { throw new Error('denied'); });
    await expect(storage.remove('k')).resolves.toBeUndefined();
  });
});
