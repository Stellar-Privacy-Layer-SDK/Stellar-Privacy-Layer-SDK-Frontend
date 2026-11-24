import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  parseNetwork,
  getNetworkConfig,
  isDebugEnabled,
  getZkArtifactsBaseUrl,
} from './env';
import { Network } from '@stellar-privacy/sdk';

describe('parseNetwork', () => {
  it('maps known network names', () => {
    expect(parseNetwork('public')).toBe(Network.PUBLIC);
    expect(parseNetwork('MAINNET')).toBe(Network.PUBLIC);
    expect(parseNetwork('futurenet')).toBe(Network.FUTURENET);
    expect(parseNetwork('sandbox')).toBe(Network.SANDBOX);
  });

  it('falls back to testnet for unknown or missing values', () => {
    expect(parseNetwork(undefined)).toBe(Network.TESTNET);
    expect(parseNetwork('garbage')).toBe(Network.TESTNET);
    expect(parseNetwork('')).toBe(Network.TESTNET);
  });
});

describe('getNetworkConfig', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('applies environment overrides', () => {
    vi.stubEnv('VITE_STELLAR_NETWORK', 'public');
    vi.stubEnv('VITE_CONTRACT_ID', 'CA123EXAMPLE');
    vi.stubEnv('VITE_SOROBAN_RPC_URL', 'https://rpc.example.com');
    vi.stubEnv('VITE_HORIZON_URL', 'https://horizon.example.com');

    const cfg = getNetworkConfig();
    expect(cfg.network).toBe(Network.PUBLIC);
    expect(cfg.contractId).toBe('CA123EXAMPLE');
    expect(cfg.rpcUrl).toBe('https://rpc.example.com');
    expect(cfg.horizonUrl).toBe('https://horizon.example.com');
  });

  it('falls back to network defaults without overrides', () => {
    vi.stubEnv('VITE_STELLAR_NETWORK', '');
    const cfg = getNetworkConfig();
    expect(cfg.network).toBe(Network.TESTNET);
    expect(cfg.contractId).toBe('');
    expect(cfg.rpcUrl).toContain('testnet');
  });
});

describe('isDebugEnabled', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('respects the VITE_DEBUG flag', () => {
    vi.stubEnv('VITE_DEBUG', 'true');
    expect(isDebugEnabled()).toBe(true);
    vi.stubEnv('VITE_DEBUG', 'false');
    expect(isDebugEnabled()).toBe(false);
  });
});

describe('getZkArtifactsBaseUrl', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns the configured artifacts URL', () => {
    vi.stubEnv('VITE_ZK_ARTIFACTS_URL', 'https://cdn.example.com/artifacts/');
    expect(getZkArtifactsBaseUrl()).toBe('https://cdn.example.com/artifacts/');
  });

  it('returns null when unset or blank', () => {
    vi.stubEnv('VITE_ZK_ARTIFACTS_URL', '');
    expect(getZkArtifactsBaseUrl()).toBeNull();
    vi.stubEnv('VITE_ZK_ARTIFACTS_URL', '   ');
    expect(getZkArtifactsBaseUrl()).toBeNull();
    vi.stubEnv('VITE_ZK_ARTIFACTS_URL', undefined as unknown as string);
    expect(getZkArtifactsBaseUrl()).toBeNull();
  });
});
