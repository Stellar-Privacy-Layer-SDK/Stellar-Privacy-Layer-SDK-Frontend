import { describe, it, expect } from 'vitest';
import { NETWORK_CONFIGS, resolveNetworkConfig } from './config.js';
import { Network } from '../types.js';
import { Networks } from '@stellar/stellar-sdk';

describe('NETWORK_CONFIGS', () => {
  it('defines all four networks', () => {
    expect(Object.keys(NETWORK_CONFIGS)).toHaveLength(4);
    for (const network of Object.values(Network)) {
      expect(NETWORK_CONFIGS[network]).toBeDefined();
      expect(NETWORK_CONFIGS[network].network).toBe(network);
      expect(NETWORK_CONFIGS[network].rpcUrl).toBeTruthy();
      expect(NETWORK_CONFIGS[network].networkPassphrase).toBeTruthy();
    }
  });

  it('uses the canonical Stellar network passphrases', () => {
    expect(NETWORK_CONFIGS[Network.PUBLIC].networkPassphrase).toBe(Networks.PUBLIC);
    expect(NETWORK_CONFIGS[Network.TESTNET].networkPassphrase).toBe(Networks.TESTNET);
    expect(NETWORK_CONFIGS[Network.FUTURENET].networkPassphrase).toBe(Networks.FUTURENET);
    expect(NETWORK_CONFIGS[Network.SANDBOX].networkPassphrase).toBe(Networks.STANDALONE);
  });
});

describe('resolveNetworkConfig', () => {
  it('returns network defaults when no overrides are provided', () => {
    const cfg = resolveNetworkConfig(Network.TESTNET);
    expect(cfg).toEqual(NETWORK_CONFIGS[Network.TESTNET]);
  });

  it('applies provided overrides', () => {
    const cfg = resolveNetworkConfig(Network.TESTNET, {
      rpcUrl: 'https://custom-rpc.example.com',
      horizonUrl: 'https://custom-horizon.example.com',
      contractId: 'CAEXAMPLE',
    });
    expect(cfg.rpcUrl).toBe('https://custom-rpc.example.com');
    expect(cfg.horizonUrl).toBe('https://custom-horizon.example.com');
    expect(cfg.contractId).toBe('CAEXAMPLE');
    expect(cfg.network).toBe(Network.TESTNET);
    expect(cfg.networkPassphrase).toBe(NETWORK_CONFIGS[Network.TESTNET].networkPassphrase);
  });

  it('ignores blank overrides and falls back to defaults', () => {
    const cfg = resolveNetworkConfig(Network.PUBLIC, { rpcUrl: '   ', contractId: '' });
    expect(cfg.rpcUrl).toBe(NETWORK_CONFIGS[Network.PUBLIC].rpcUrl);
    expect(cfg.contractId).toBe('');
  });
});
