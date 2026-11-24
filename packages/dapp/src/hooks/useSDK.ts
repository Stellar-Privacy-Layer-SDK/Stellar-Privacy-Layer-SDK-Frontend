import { useState, useEffect, useCallback, useRef } from 'react';
import {
  PrivacySDK,
  WalletInfo,
  Note,
  ShieldedTransaction,
  ViewingKey,
  Network,
  createLocalStorageProvider,
  SnarkjsProver,
  HttpRelayer,
  type StorageProvider,
  resolveArtifactUrls,
} from '@stellar-privacy/sdk';
import { getNetworkConfig, getRelayerUrl, getZkArtifactsBaseUrl } from '../env';

const NETWORK_STORAGE_KEY = 'stellar-privacy:network';

let storage: StorageProvider | null = null;
let sdkInstance: PrivacySDK | null = null;
let initPromise: Promise<void> | null = null;

/** Withdrawals need `VITE_ZK_ARTIFACTS_URL`; deposits work without it. */
function createProver(): SnarkjsProver | undefined {
  const baseUrl = getZkArtifactsBaseUrl();
  if (!baseUrl) return undefined;
  return new SnarkjsProver(resolveArtifactUrls(baseUrl));
}

/** Must be called before the SDK is first used (see UnlockGate). */
export function setSDKStorage(provider: StorageProvider): void {
  storage = provider;
}

function getSDK(): PrivacySDK {
  if (!sdkInstance) {
    const relayerUrl = getRelayerUrl();
    const sdk: PrivacySDK = new PrivacySDK({
      relayer: relayerUrl ? new HttpRelayer(relayerUrl) : undefined,
      signer: (xdr, passphrase) => sdk.wallet.signTransaction(xdr, passphrase),
      network: getNetworkConfig(),
      storageProvider: storage ?? createLocalStorageProvider(),
      prover: createProver(),
    });
    sdkInstance = sdk;
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
  const [walletInfo, setWalletInfo] = useState<WalletInfo | null>(() => sdk.wallet.getWalletInfo());
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connect = useCallback(async () => {
    setIsConnecting(true);
    setError(null);
    try {
      const info = await sdk.wallet.connect();
      const { network } = sdk.client.getNetworkConfig();
      if (info.network !== network) {
        sdk.wallet.disconnect();
        throw new Error(`Wallet is on ${info.network}; switch it to ${network}`);
      }
      await sdk.client.connectWallet(info.publicKey, network);
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
      if (info.network === sdk.client.getNetworkConfig().network) setWalletInfo(info);
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

export function usePool() {
  const sdk = useSDK();
  const ready = useSDKReady();
  const [notes, setNotes] = useState<Note[]>([]);
  const [transactions, setTransactions] = useState<ShieldedTransaction[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    const sync = () => {
      setNotes(sdk.pool.getNotes());
      setTransactions(sdk.pool.getTransactions());
    };
    sync();
    sdk.pool.on('change', sync);
    return () => {
      sdk.pool.removeListener('change', sync);
    };
  }, [sdk, ready]);

  const run = useCallback(async <T,>(action: () => Promise<T>): Promise<T> => {
    setIsProcessing(true);
    setError(null);
    try {
      return await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      throw e;
    } finally {
      setIsProcessing(false);
    }
  }, []);

  const deposit = useCallback(() => run(() => sdk.pool.deposit()), [sdk, run]);
  const withdraw = useCallback(
    (note: Note, recipient: string, maxFee: string) =>
      run(() => sdk.pool.withdraw(note.commitment, recipient, maxFee)),
    [sdk, run],
  );
  const importNote = useCallback(
    (text: string) => run(() => sdk.pool.importNote(text)),
    [sdk, run],
  );
  /** Best effort; callers poll. */
  const refresh = useCallback(() => sdk.pool.refresh().catch(() => {}), [sdk]);

  return { notes, transactions, isProcessing, error, deposit, withdraw, importNote, refresh };
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
