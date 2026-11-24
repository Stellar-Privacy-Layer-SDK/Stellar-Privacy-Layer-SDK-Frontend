import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { Network } from '@stellar-privacy/sdk';
import type { ViewingKey } from '@stellar-privacy/sdk';
import {
  useWallet,
  useNetwork,
  useSDKReady,
  useViewingKeys,
  useShieldedTransfer,
} from './useSDK';

const { mocks } = vi.hoisted(() => ({
  mocks: {
    network: {
      PUBLIC: 'public',
      TESTNET: 'testnet',
      FUTURENET: 'futurenet',
      SANDBOX: 'sandbox',
    },
    client: {
      connectWallet: vi.fn(),
      disconnectWallet: vi.fn(),
      switchNetwork: vi.fn(),
      getNetworkConfig: vi.fn(() => ({ network: 'testnet' })),
    },
    wallet: {
      connect: vi.fn(),
      disconnect: vi.fn(),
      setNetwork: vi.fn(),
      on: vi.fn(),
      removeListener: vi.fn(),
    },
    shieldedTransfer: {
      deposit: vi.fn(),
      getTransactionHistory: vi.fn(),
      getCommitments: vi.fn(async () => []),
      refreshPendingTransactions: vi.fn(),
      withdraw: vi.fn(),
    },
    viewingKeys: {
      getAllViewingKeys: vi.fn<() => Partial<ViewingKey>[]>(() => []),
      createViewingKey: vi.fn(),
      grantViewingKey: vi.fn(),
      revokeViewingKey: vi.fn(),
      getPrivateKey: vi.fn(),
      on: vi.fn(),
      removeListener: vi.fn(),
    },
  },
}));

vi.mock('@stellar-privacy/sdk', () => ({
  Network: mocks.network,
  createLocalStorageProvider: () => ({
    get: vi.fn(),
    set: vi.fn(),
    remove: vi.fn(),
  }),
  resolveNetworkConfig: (network: string) => ({
    network,
    rpcUrl: '',
    networkPassphrase: '',
    contractId: '',
    horizonUrl: '',
  }),
  PrivacySDK: class {
    client = mocks.client;
    wallet = mocks.wallet;
    shieldedTransfer = mocks.shieldedTransfer;
    viewingKeys = mocks.viewingKeys;
    initialize = vi.fn().mockResolvedValue(undefined);
  },
}));

const publicKey = 'GA' + 'X'.repeat(54);

describe('useWallet', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.wallet.connect.mockResolvedValue({
      publicKey,
      network: 'testnet',
      isConnected: true,
    });
    mocks.client.connectWallet.mockResolvedValue({
      publicKey,
      network: 'testnet',
      isConnected: true,
    });
  });

  it('syncs the connected wallet into the RPC client', async () => {
    const { result } = renderHook(() => useWallet());
    await act(async () => {
      await result.current.connect();
    });
    expect(mocks.wallet.connect).toHaveBeenCalled();
    expect(mocks.client.connectWallet).toHaveBeenCalledWith(publicKey, 'testnet');
    expect(result.current.walletInfo?.isConnected).toBe(true);
  });

  it('disconnects both the wallet and the RPC client', () => {
    const { result } = renderHook(() => useWallet());
    act(() => {
      result.current.disconnect();
    });
    expect(mocks.wallet.disconnect).toHaveBeenCalled();
    expect(mocks.client.disconnectWallet).toHaveBeenCalled();
  });
});

describe('useNetwork', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('switches the network across client, wallet and storage', () => {
    const { result } = renderHook(() => useNetwork());
    act(() => {
      result.current.switchNetwork(Network.PUBLIC);
    });
    expect(mocks.client.switchNetwork).toHaveBeenCalledWith('public');
    expect(mocks.wallet.setNetwork).toHaveBeenCalledWith('public');
    expect(localStorage.getItem('stellar-privacy:network')).toBe('public');
    expect(result.current.network).toBe('public');
  });

  it('reads the persisted network on initialisation', () => {
    localStorage.setItem('stellar-privacy:network', 'futurenet');
    const { result } = renderHook(() => useNetwork());
    expect(result.current.network).toBe('futurenet');
  });
});

describe('useNetwork defaults', () => {
  it.each([null, 'bogus'])('uses the configured network when %s is saved', (saved) => {
    localStorage.clear();
    if (saved) localStorage.setItem('stellar-privacy:network', saved);
    mocks.client.getNetworkConfig.mockReturnValue({ network: 'public' });
    const { result } = renderHook(() => useNetwork());
    expect(result.current.network).toBe('public');
    mocks.client.getNetworkConfig.mockReturnValue({ network: 'testnet' });
  });
});

describe('useSDKReady', () => {
  it('reports ready after SDK initialisation', async () => {
    const { result } = renderHook(() => useSDKReady());
    await waitFor(() => {
      expect(result.current).toBe(true);
    });
  });
});

describe('useViewingKeys', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.viewingKeys.getAllViewingKeys.mockReturnValue([]);
  });

  it('exposes the private key lookup', () => {
    mocks.viewingKeys.getPrivateKey.mockReturnValue('deadbeef');
    const { result } = renderHook(() => useViewingKeys());
    expect(result.current.getPrivateKey('key-1')).toBe('deadbeef');
  });

  it('creates a key and refreshes the list', async () => {
    mocks.viewingKeys.getAllViewingKeys.mockReturnValue([{ id: 'k1' }]);
    mocks.viewingKeys.createViewingKey.mockResolvedValue({ id: 'k1' });
    const { result } = renderHook(() => useViewingKeys());
    await act(async () => {
      await result.current.createKey('Label', 'full');
    });
    expect(mocks.viewingKeys.createViewingKey).toHaveBeenCalledWith('Label', 'full', undefined);
    expect(result.current.keys).toHaveLength(1);
  });

  it('grants and revokes keys', async () => {
    mocks.viewingKeys.grantViewingKey.mockResolvedValue({ id: 'k2' });
    mocks.viewingKeys.getAllViewingKeys.mockReturnValue([{ id: 'k2' }]);
    const { result } = renderHook(() => useViewingKeys());
    await act(async () => {
      await result.current.grantKey(publicKey, 'amount-only');
    });
    expect(mocks.viewingKeys.grantViewingKey).toHaveBeenCalledWith(
      publicKey,
      'amount-only',
      undefined,
    );
    await act(async () => {
      await result.current.revokeKey('k2');
    });
    expect(mocks.viewingKeys.revokeViewingKey).toHaveBeenCalledWith('k2');
  });
});

describe('useShieldedTransfer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.shieldedTransfer.deposit.mockResolvedValue({
      txHash: 'hash-1',
      commitmentHash: 'cm-1',
      nullifier: 'n-1',
      status: 'pending',
    });
    mocks.shieldedTransfer.getTransactionHistory.mockResolvedValue([{ txHash: 'hash-1' }]);
  });

  it('deposits and refreshes the transaction history', async () => {
    const { result } = renderHook(() => useShieldedTransfer());
    await act(async () => {
      await result.current.deposit('10', 'USDC', publicKey, 'memo');
    });
    expect(mocks.shieldedTransfer.deposit).toHaveBeenCalledWith({
      amount: '10',
      token: 'USDC',
      recipient: publicKey,
      memo: 'memo',
    });
    expect(mocks.shieldedTransfer.getTransactionHistory).toHaveBeenCalled();
    expect(result.current.transactions).toHaveLength(1);
  });

  it('surfaces deposit errors', async () => {
    mocks.shieldedTransfer.deposit.mockRejectedValueOnce(new Error('proof failed'));
    const { result } = renderHook(() => useShieldedTransfer());
    await act(async () => {
      await expect(result.current.deposit('10', 'USDC', publicKey)).rejects.toThrow(
        'proof failed',
      );
    });
    expect(result.current.error).toBe('proof failed');
  });

  it('withdraws the whole commitment', async () => {
    mocks.shieldedTransfer.withdraw.mockResolvedValue({ txHash: 'w' });
    const { result } = renderHook(() => useShieldedTransfer());
    const commitment = {
      hash: 'cm-1', nullifier: 'n', amount: '10', token: 'XLM', recipient: publicKey, timestamp: 1,
    };
    await act(async () => {
      await result.current.withdraw(commitment, publicKey);
    });
    expect(mocks.shieldedTransfer.withdraw).toHaveBeenCalledWith('cm-1', publicKey, '10');
  });

  it('reloads the history only when a pending status changed', async () => {
    const { result } = renderHook(() => useShieldedTransfer());
    await waitFor(() => expect(result.current.transactions).toHaveLength(1));
    mocks.shieldedTransfer.getTransactionHistory.mockClear();
    mocks.shieldedTransfer.refreshPendingTransactions.mockResolvedValueOnce(false);
    await act(() => result.current.refreshPending());
    expect(mocks.shieldedTransfer.getTransactionHistory).not.toHaveBeenCalled();
    mocks.shieldedTransfer.refreshPendingTransactions.mockResolvedValueOnce(true);
    await act(() => result.current.refreshPending());
    expect(mocks.shieldedTransfer.getTransactionHistory).toHaveBeenCalledTimes(1);
  });
});
