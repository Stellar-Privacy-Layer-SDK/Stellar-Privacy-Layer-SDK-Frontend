import { describe, it, expect, beforeEach } from 'vitest';
import { createLocalStorageProvider, createMemoryStorageProvider } from './storage';
import type { StorageProvider } from '../types';

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

if (typeof localStorage !== 'undefined') {
  runStorageTests('LocalStorageProvider', () => {
    localStorage.clear();
    return createLocalStorageProvider();
  });
}
