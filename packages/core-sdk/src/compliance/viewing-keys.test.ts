import { describe, it, expect, beforeAll } from 'vitest';
import { ViewingKeyManager } from './viewing-keys';
import { createMemoryStorageProvider } from '../utils/storage';

describe('ViewingKeyManager', () => {
  let vk: ViewingKeyManager;

  beforeAll(() => {
    vk = new ViewingKeyManager(createMemoryStorageProvider());
  });

  describe('createViewingKey', () => {
    it('creates a key with the given label and scope', async () => {
      const key = await vk.createViewingKey('Test Key', 'full');
      expect(key.label).toBe('Test Key');
      expect(key.scope).toBe('full');
      expect(key.active).toBe(true);
      expect(key.id).toBeTruthy();
    });

    it('creates a key with amount-only scope', async () => {
      const key = await vk.createViewingKey('Amount Only', 'amount-only');
      expect(key.scope).toBe('amount-only');
    });

    it('creates a key with recipient-only scope', async () => {
      const key = await vk.createViewingKey('Recipient Only', 'recipient-only');
      expect(key.scope).toBe('recipient-only');
    });
  });

  describe('grantViewingKey', () => {
    it('grants a key to a recipient', async () => {
      const key = await vk.grantViewingKey('GA' + 'X'.repeat(54), 'full');
      expect(key.grantedBy).toBe('GA' + 'X'.repeat(54));
      expect(key.active).toBe(true);
    });
  });

  describe('getViewingKey / getAllViewingKeys', () => {
    it('retrieves a key by id', async () => {
      const created = await vk.createViewingKey('Findable', 'full');
      const found = vk.getViewingKey(created.id);
      expect(found).toBeDefined();
      expect(found!.label).toBe('Findable');
    });

    it('returns all keys', () => {
      const keys = vk.getAllViewingKeys();
      expect(keys.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('getActiveViewingKeys', () => {
    it('only returns active, non-expired keys', async () => {
      const key = await vk.createViewingKey('Active Test', 'full');
      const active = vk.getActiveViewingKeys();
      expect(active.some((k) => k.id === key.id)).toBe(true);
    });
  });

  describe('revokeViewingKey', () => {
    it('marks a key as inactive', async () => {
      const key = await vk.createViewingKey('Revocable', 'full');
      expect(key.active).toBe(true);

      await vk.revokeViewingKey(key.id);
      const revoked = vk.getViewingKey(key.id);
      expect(revoked!.active).toBe(false);
    });

    it('removes from active keys after revoke', async () => {
      const key = await vk.createViewingKey('ToRevoke', 'full');
      await vk.revokeViewingKey(key.id);
      const active = vk.getActiveViewingKeys();
      expect(active.some((k) => k.id === key.id)).toBe(false);
    });
  });
});
