import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  parseNetwork,
  getNetworkConfig,
  isDebugEnabled,
  getZkArtifactsBaseUrl,
  getSupportedTokens,
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

describe('getSupportedTokens', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('always includes native XLM', () => {
    const tokens = getSupportedTokens();
    expect(tokens.some((t) => t.symbol === 'XLM' && t.contract === 'native')).toBe(true);
  });

  it('adds tokens configured with a valid contract address', () => {
    const usdc = 'C' + 'A'.repeat(55);
    vi.stubEnv('VITE_TOKEN_CONTRACTS', JSON.stringify({ USDC: usdc, XLM: 'native' }));
    const tokens = getSupportedTokens();
    expect(tokens.find((t) => t.symbol === 'USDC')?.contract).toBe(usdc);
    expect(tokens.filter((t) => t.symbol === 'XLM')).toHaveLength(1);
  });

  it('never surfaces placeholder or malformed addresses', () => {
    vi.stubEnv(
      'VITE_TOKEN_CONTRACTS',
      JSON.stringify({ USDC: '...', BAD: 'not-an-address', OK: 'C' + 'B'.repeat(55) }),
    );
    const tokens = getSupportedTokens();
    expect(tokens.some((t) => t.symbol === 'USDC')).toBe(false);
    expect(tokens.some((t) => t.symbol === 'BAD')).toBe(false);
    expect(tokens.find((t) => t.symbol === 'OK')?.contract).toBe('C' + 'B'.repeat(55));
  });

  it('falls back to XLM only on malformed JSON', () => {
    vi.stubEnv('VITE_TOKEN_CONTRACTS', '{not valid json');
    const tokens = getSupportedTokens();
    expect(tokens.map((t) => t.symbol)).toEqual(['XLM']);
  });
});
