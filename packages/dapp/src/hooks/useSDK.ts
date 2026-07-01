import { useState, useEffect, useCallback, useRef } from 'react';
import { PrivacySDK, WalletInfo, ShieldedTransaction, ViewingKey, Network } from '@stellar-privacy/sdk';

let sdkInstance: PrivacySDK | null = null;

function getSDK(): PrivacySDK {
  if (!sdkInstance) {
    sdkInstance = new PrivacySDK();
  }
  return sdkInstance;
}

export function useSDK() {
  const sdk = useRef(getSDK()).current;
  return sdk;
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
    setWalletInfo(null);
  }, [sdk]);

  useEffect(() => {
    const handleConnect = (info: WalletInfo) => setWalletInfo(info);
    const handleDisconnect = () => setWalletInfo(null);

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
  const [transactions, setTransactions] = useState<ShieldedTransaction[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const deposit = useCallback(async (
    amount: string,
    token: string,
    recipient: string,
    memo?: string,
  ) => {
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
  }, [sdk]);

  const refreshHistory = useCallback(async () => {
    try {
      const history = await sdk.shieldedTransfer.getTransactionHistory();
      setTransactions(history);
    } catch {
      // ignore
    }
  }, [sdk]);

  useEffect(() => {
    refreshHistory();
  }, [refreshHistory]);

  return { transactions, isProcessing, error, deposit, refreshHistory };
}

export function useViewingKeys() {
  const sdk = useSDK();
  const [keys, setKeys] = useState<ViewingKey[]>([]);

  const refresh = useCallback(() => {
    const allKeys = sdk.viewingKeys.getAllViewingKeys();
    setKeys(allKeys);
  }, [sdk]);

  const createKey = useCallback(async (
    label: string,
    scope: ViewingKey['scope'] = 'full',
    expiresAt?: number,
  ) => {
    const key = await sdk.viewingKeys.createViewingKey(label, scope, expiresAt);
    refresh();
    return key;
  }, [sdk, refresh]);

  const grantKey = useCallback(async (
    recipientPublicKey: string,
    scope: ViewingKey['scope'] = 'full',
    expiresAt?: number,
  ) => {
    const key = await sdk.viewingKeys.grantViewingKey(recipientPublicKey, scope, expiresAt);
    refresh();
    return key;
  }, [sdk, refresh]);

  const revokeKey = useCallback(async (keyId: string) => {
    await sdk.viewingKeys.revokeViewingKey(keyId);
    refresh();
  }, [sdk, refresh]);

  useEffect(() => {
    refresh();
    sdk.viewingKeys.on('onViewingKeyCreated', refresh);
    sdk.viewingKeys.on('onViewingKeyRevoked', refresh);
    return () => {
      sdk.viewingKeys.removeListener('onViewingKeyCreated', refresh);
      sdk.viewingKeys.removeListener('onViewingKeyRevoked', refresh);
    };
  }, [sdk, refresh]);

  return { keys, createKey, grantKey, revokeKey, refresh };
}

export function useNetwork() {
  const sdk = useSDK();
  const [network, setNetwork] = useState<Network>(() => {
    try {
      const saved = localStorage.getItem('stellar-privacy-network');
      return saved ? (saved as Network) : Network.TESTNET;
    } catch {
      return Network.TESTNET;
    }
  });

  const switchNetwork = useCallback((newNetwork: Network) => {
    sdk.client.switchNetwork(newNetwork);
    setNetwork(newNetwork);
    try { localStorage.setItem('stellar-privacy-network', newNetwork); } catch {}
  }, [sdk]);

  useEffect(() => {
    const cfg = sdk.client.getNetworkConfig();
    if (cfg.network !== network) {
      sdk.client.switchNetwork(network);
    }
  }, [sdk, network]);

  return { network, switchNetwork };
}
