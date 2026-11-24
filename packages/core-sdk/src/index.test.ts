import { describe, expect, it } from 'vitest';
import { createMemoryStorageProvider, Network, NETWORK_CONFIGS, PrivacySDK } from './index.js';

describe('PrivacySDK', () => {
  it('wires the modules together and persists viewing keys', async () => {
    const storageProvider = createMemoryStorageProvider();
    const options = {
      network: NETWORK_CONFIGS[Network.FUTURENET], logLevel: 'error' as const, storageProvider,
    };
    const sdk = new PrivacySDK(options);
    await sdk.initialize();
    expect(sdk.client.getNetworkConfig().network).toBe(Network.FUTURENET);
    expect(sdk.pool.getNotes()).toEqual([]);
    await sdk.viewingKeys.createViewingKey('Audit');

    const reloaded = new PrivacySDK(options);
    await reloaded.initialize();
    expect(reloaded.viewingKeys.getAllViewingKeys()).toHaveLength(1);
  });
});
