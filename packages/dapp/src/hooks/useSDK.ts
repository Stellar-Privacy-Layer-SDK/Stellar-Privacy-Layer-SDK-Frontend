import { useState, useEffect, useCallback, useRef } from 'react';
import {
  PrivacySDK,
  WalletInfo,
  ShieldedTransaction,
  ViewingKey,
  Network,
  createLocalStorageProvider,
  SnarkjsProver,
  resolveArtifactUrls,
} from '@stellar-privacy/sdk';
import { getNetworkConfig, getZkArtifactsBaseUrl } from '../env';

const NETWORK_STORAGE_KEY = 'stellar-privacy:network';

let sdkInstance: PrivacySDK | null = null;
let initPromise: Promise<void> | null = null;

/**
 * Uses the real Groth16 prover when `VITE_ZK_ARTIFACTS_URL` is configured;
 * otherwise falls back to the dev-only simulated prover (default).
 */
function createProver(): SnarkjsProver | undefined {
  const baseUrl = getZkArtifactsBaseUrl();
  if (!baseUrl) return undefined;
  return new SnarkjsProver(resolveArtifactUrls(baseUrl));
}

function getSDK(): PrivacySDK {
  if (!sdkInstance) {
    sdkInstance = new PrivacySDK({
      network: getNetworkConfig(),
      storageProvider: createLocalStorageProvider(),
      prover: createProver(),
    });
    initPromise = sdkInstance.initialize();
  }
  return sdkInstance;
}

export function useSDK() {
  const sdk = useRef(getSDK()).current;
  return sdk;
}

/** Resolves to true once the SDK has loaded its persisted state. */
export function useSDKReady(): boolean {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    getSDK();
    initPromise
      ?.then(() => {
        if (active) setReady(true);
      })
      .catch(() => {
        if (active) setReady(true);
      });
    return () => {
      active = false;
    };
  }, []);

  return ready;
}

export function useWallet() {
  const sdk = useSDK();
  const [walletInfo, setWalletInfo] = useState<WalletInfo | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connect = useCallback(async () => {
    setIsConnecting(true);
    setError(null);
    try {
      const info = await sdk.wallet.connect();
      // Keep the RPC client in sync so on-chain operations work.
      await sdk.client.connectWallet(info.publicKey, info.network);
      setWalletInfo(info);
      return info;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to connect wallet';
      setError(msg);
      throw e;
    } finally {
      setIsConnecting(false);
    }
  }, [sdk]);

  const disconnect = useCallback(() => {
    sdk.wallet.disconnect();
    sdk.client.disconnectWallet();
    setWalletInfo(null);
  }, [sdk]);

  useEffect(() => {
    const handleConnect = (info: WalletInfo) => {
      setWalletInfo(info);
      void sdk.client.connectWallet(info.publicKey, info.network);
    };
    const handleDisconnect = () => {
      setWalletInfo(null);
      sdk.client.disconnectWallet();
    };

    sdk.wallet.on('onWalletConnected', handleConnect);
    sdk.wallet.on('onWalletDisconnected', handleDisconnect);

    return () => {
      sdk.wallet.removeListener('onWalletConnected', handleConnect);
      sdk.wallet.removeListener('onWalletDisconnected', handleDisconnect);
    };
  }, [sdk]);

  return { walletInfo, isConnecting, error, connect, disconnect };
}

export function useShieldedTransfer() {
  const sdk = useSDK();
  const ready = useSDKReady();
  const [transactions, setTransactions] = useState<ShieldedTransaction[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const deposit = useCallback(
    async (amount: string, token: string, recipient: string, memo?: string) => {
      setIsProcessing(true);
      setError(null);
      try {
        const result = await sdk.shieldedTransfer.deposit({
          amount,
          token,
          recipient,
          memo,
        });
        const history = await sdk.shieldedTransfer.getTransactionHistory();
        setTransactions(history);
        return result;
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Transfer failed';
        setError(msg);
        throw e;
      } finally {
        setIsProcessing(false);
      }
    },
    [sdk],
  );

  const refreshHistory = useCallback(async () => {
    try {
      const history = await sdk.shieldedTransfer.getTransactionHistory();
      setTransactions(history);
    } catch {
      // history refresh is best-effort
    }
  }, [sdk]);

  useEffect(() => {
    if (ready) void refreshHistory();
  }, [ready, refreshHistory]);

  /** Polls the network, then reloads the history if anything changed. */
  const refreshPending = useCallback(async () => {
    try {
      if (await sdk.shieldedTransfer.refreshPendingTransactions()) await refreshHistory();
    } catch {
      // retried on the next poll
    }
  }, [sdk, refreshHistory]);

  return { transactions, isProcessing, error, deposit, refreshHistory, refreshPending };
}

export function useViewingKeys() {
  const sdk = useSDK();
  const ready = useSDKReady();
  const [keys, setKeys] = useState<ViewingKey[]>([]);

  const refresh = useCallback(() => {
    const allKeys = sdk.viewingKeys.getAllViewingKeys();
    setKeys(allKeys);
  }, [sdk]);

  const createKey = useCallback(
    async (label: string, scope: ViewingKey['scope'] = 'full', expiresAt?: number) => {
      const key = await sdk.viewingKeys.createViewingKey(label, scope, expiresAt);
      refresh();
      return key;
    },
    [sdk, refresh],
  );

  const grantKey = useCallback(
    async (recipientPublicKey: string, scope: ViewingKey['scope'] = 'full', expiresAt?: number) => {
      const key = await sdk.viewingKeys.grantViewingKey(recipientPublicKey, scope, expiresAt);
      refresh();
      return key;
    },
    [sdk, refresh],
  );

  const revokeKey = useCallback(
    async (keyId: string) => {
      await sdk.viewingKeys.revokeViewingKey(keyId);
      refresh();
    },
    [sdk, refresh],
  );

  const getPrivateKey = useCallback(
    (keyId: string) => sdk.viewingKeys.getPrivateKey(keyId),
    [sdk],
  );

  useEffect(() => {
    if (!ready) return;
    refresh();
    sdk.viewingKeys.on('onViewingKeyCreated', refresh);
    sdk.viewingKeys.on('onViewingKeyRevoked', refresh);
    return () => {
      sdk.viewingKeys.removeListener('onViewingKeyCreated', refresh);
      sdk.viewingKeys.removeListener('onViewingKeyRevoked', refresh);
    };
  }, [sdk, refresh, ready]);

  return { keys, createKey, grantKey, revokeKey, getPrivateKey, refresh };
}

export function useNetwork() {
  const sdk = useSDK();
  const [network, setNetwork] = useState<Network>(() => {
    try {
      const saved = localStorage.getItem(NETWORK_STORAGE_KEY);
      if (Object.values(Network).includes(saved as Network)) return saved as Network;
    } catch {
      // storage unavailable
    }
    return sdk.client.getNetworkConfig().network;
  });

  const switchNetwork = useCallback(
    (newNetwork: Network) => {
      sdk.client.switchNetwork(newNetwork);
      sdk.wallet.setNetwork(newNetwork);
      setNetwork(newNetwork);
      try {
        localStorage.setItem(NETWORK_STORAGE_KEY, newNetwork);
      } catch {
        // storage unavailable — network still switches for this session
      }
    },
    [sdk],
  );

  useEffect(() => {
    const cfg = sdk.client.getNetworkConfig();
    if (cfg.network !== network) {
      sdk.client.switchNetwork(network);
      sdk.wallet.setNetwork(network);
    }
  }, [sdk, network]);

  return { network, switchNetwork };
}
