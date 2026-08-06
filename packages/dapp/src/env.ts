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
