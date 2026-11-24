import { Network, NetworkConfig } from '../types';

export const NETWORK_CONFIGS: Record<Network, NetworkConfig> = {
  [Network.PUBLIC]: {
    network: Network.PUBLIC,
    rpcUrl: 'https://mainnet.sorobanrpc.com',
    networkPassphrase: 'Public Global Stellar Network ; September 2015',
    contractId: '',
    horizonUrl: 'https://horizon.stellar.org',
  },
  [Network.TESTNET]: {
    network: Network.TESTNET,
    rpcUrl: 'https://soroban-testnet.stellar.org',
    networkPassphrase: 'Test SDF Network ; September 2015',
    contractId: '',
    horizonUrl: 'https://horizon-testnet.stellar.org',
  },
  [Network.FUTURENET]: {
    network: Network.FUTURENET,
    rpcUrl: 'https://rpc-futurenet.stellar.org',
    networkPassphrase: 'Test SDF Future Network ; October 2022',
    contractId: '',
    horizonUrl: 'https://horizon-futurenet.stellar.org',
  },
  [Network.SANDBOX]: {
    network: Network.SANDBOX,
    rpcUrl: 'http://localhost:8000/soroban/rpc',
    networkPassphrase: 'Standalone Network ; February 2017',
    contractId: '',
    horizonUrl: 'http://localhost:8000',
  },
};

export interface NetworkOverrides {
  rpcUrl?: string;
  horizonUrl?: string;
  contractId?: string;
}

/**
 * Resolve a full network config from a network name plus optional overrides
 * (e.g. values provided via environment variables).
 */
export function resolveNetworkConfig(
  network: Network,
  overrides: NetworkOverrides = {},
): NetworkConfig {
  const base = NETWORK_CONFIGS[network];
  return {
    ...base,
    rpcUrl: overrides.rpcUrl?.trim() || base.rpcUrl,
    horizonUrl: overrides.horizonUrl?.trim() || base.horizonUrl,
    contractId: overrides.contractId?.trim() || base.contractId,
  };
}

export const PRIVACY_CONTRACT_METHODS = {
  DEPOSIT: 'deposit',
  WITHDRAW: 'withdraw',
  VERIFY_PROOF: 'verify_proof',
  ADD_COMMITMENT: 'add_commitment',
  SPEND_NULLIFIER: 'spend_nullifier',
  GET_COMMITMENT: 'get_commitment',
  IS_NULLIFIER_SPENT: 'is_nullifier_spent',
  SET_VIEWING_KEY: 'set_viewing_key',
  REVOKE_VIEWING_KEY: 'revoke_viewing_key',
  DISCLOSE_TRANSACTION: 'disclose_transaction',
} as const;
