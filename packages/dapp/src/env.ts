import {
  Network,
  resolveNetworkConfig,
  type NetworkConfig,
} from '@stellar-privacy/sdk';

interface DappEnv {
  readonly VITE_STELLAR_NETWORK?: string;
  readonly VITE_SOROBAN_RPC_URL?: string;
  readonly VITE_CONTRACT_ID?: string;
  readonly VITE_HORIZON_URL?: string;
  readonly VITE_DEBUG?: string;
  /**
   * Base URL of hosted Groth16 circuit artifacts (withdraw.wasm,
   * withdraw_final.zkey, verification_key.json). Required to
   * withdraw.
   */
  readonly VITE_ZK_ARTIFACTS_URL?: string;
  /** Relayer for withdrawals; without it the connected wallet submits them. */
  readonly VITE_RELAYER_URL?: string;
}

function readEnv(): DappEnv {
  return import.meta.env as DappEnv;
}

export function parseNetwork(value: string | undefined): Network {
  switch (value?.toLowerCase()) {
    case 'public':
    case 'mainnet':
      return Network.PUBLIC;
    case 'futurenet':
      return Network.FUTURENET;
    case 'sandbox':
      return Network.SANDBOX;
    default:
      return Network.TESTNET;
  }
}

/**
 * Build the SDK network configuration from environment variables.
 * Falls back to the network's built-in defaults when vars are unset.
 */
export function getNetworkConfig(): NetworkConfig {
  const env = readEnv();
  const network = parseNetwork(env.VITE_STELLAR_NETWORK);
  return resolveNetworkConfig(network, {
    rpcUrl: env.VITE_SOROBAN_RPC_URL,
    horizonUrl: env.VITE_HORIZON_URL,
    contractId: env.VITE_CONTRACT_ID,
  });
}

export function isDebugEnabled(): boolean {
  return readEnv().VITE_DEBUG === 'true';
}

/**
 * Base URL for real Groth16 circuit artifacts, or `null` when not configured.
 */
export function getZkArtifactsBaseUrl(): string | null {
  const url = readEnv().VITE_ZK_ARTIFACTS_URL;
  return url && url.trim() ? url.trim() : null;
}

export function getRelayerUrl(): string | null {
  return readEnv().VITE_RELAYER_URL?.trim() || null;
}
