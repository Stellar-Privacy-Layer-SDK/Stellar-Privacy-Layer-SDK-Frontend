import { beforeEach, describe, expect, it } from 'vitest';
import { hasEncryptedStorage, unlockEncryptedStorage, WrongPasswordError } from './encrypted-storage.js';
import { createMemoryStorageProvider } from './storage.js';
import type { StorageProvider } from '../types.js';

describe('encrypted storage', () => {
  let inner: StorageProvider;
  beforeEach(() => {
    inner = createMemoryStorageProvider();
  });

  it('round-trips values without storing plaintext', async () => {
    expect(await hasEncryptedStorage(inner)).toBe(false);
    const a = await unlockEncryptedStorage(inner, 'pw');
    await a.set('notes', 'top secret');
    expect(await inner.get('notes')).not.toContain('secret');
    const b = await unlockEncryptedStorage(inner, 'pw');
    expect(await b.get('notes')).toBe('top secret');
    expect(await b.get('missing')).toBeNull();
    await b.remove('notes');
    expect(await b.get('notes')).toBeNull();
    expect(await hasEncryptedStorage(inner)).toBe(true);
  });

  it('rejects a wrong or empty password', async () => {
    await unlockEncryptedStorage(inner, 'pw');
    await expect(unlockEncryptedStorage(inner, 'other')).rejects.toThrow(WrongPasswordError);
    await expect(unlockEncryptedStorage(inner, '')).rejects.toThrow('required');
  });

  it('encrypts plaintext from earlier versions when read', async () => {
    await inner.set('notes', '[]');
    const storage = await unlockEncryptedStorage(inner, 'pw');
    expect(await storage.get('notes')).toBe('[]');
    expect(await inner.get('notes')).toMatch(/^enc1:/);
  });

  it('detects values moved to another key', async () => {
    const storage = await unlockEncryptedStorage(inner, 'pw');
    await storage.set('a', '1');
    await inner.set('b', (await inner.get('a'))!);
    await expect(storage.get('b')).rejects.toThrow();
  });
});
