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
   * Base URL of hosted Groth16 circuit artifacts (shielded_transfer.wasm,
   * shielded_transfer_final.zkey, verification_key.json). When unset the
   * dApp uses the dev-only SimulatedProver.
   */
  readonly VITE_ZK_ARTIFACTS_URL?: string;
  /**
   * Token contract addresses for the dApp, as a JSON map of symbol to
   * contract ID, e.g. `{"USDC":"CA..."}`. `native` (XLM) is always enabled.
   */
  readonly VITE_TOKEN_CONTRACTS?: string;
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
 * Base URL for real Groth16 circuit artifacts, or `null` when not configured
 * (in which case the dApp falls back to the dev-only simulated prover).
 */
export function getZkArtifactsBaseUrl(): string | null {
  const url = readEnv().VITE_ZK_ARTIFACTS_URL;
  return url && url.trim() ? url.trim() : null;
}

export interface TokenOption {
  symbol: string;
  name: string;
  /** Asset contract ID, or `native` for XLM. */
  contract: string;
  decimals: number;
}

const NATIVE_LUMENS: TokenOption = {
  symbol: 'XLM',
  name: 'Stellar Lumens',
  contract: 'native',
  decimals: 7,
};

/**
 * Tokens the dApp can transact with, driven by `VITE_TOKEN_CONTRACTS`.
 *
 * Placeholder or malformed addresses (e.g. the old hardcoded `'...'`) are
 * never surfaced — only `native` or valid-looking `C...` contract IDs make it
 * into the list, so a deposit can never be sent to an invalid address.
 */
export function getSupportedTokens(): TokenOption[] {
  const tokens: TokenOption[] = [NATIVE_LUMENS];
  const raw = readEnv().VITE_TOKEN_CONTRACTS;
  if (!raw || !raw.trim()) return tokens;

  try {
    const parsed = JSON.parse(raw) as Record<string, string | undefined>;
    const seen = new Set(tokens.map((t) => t.symbol));
    for (const [symbol, contract] of Object.entries(parsed)) {
      const address = contract?.trim() ?? '';
      if (seen.has(symbol)) continue; // never duplicate a token (e.g. XLM)
      if (address === 'native' || (address.startsWith('C') && address.length === 56)) {
        tokens.push({ symbol, name: symbol, contract: address, decimals: 7 });
        seen.add(symbol);
      }
    }
  } catch {
    // Malformed VITE_TOKEN_CONTRACTS — fall back to XLM only.
  }
  return tokens;
}
