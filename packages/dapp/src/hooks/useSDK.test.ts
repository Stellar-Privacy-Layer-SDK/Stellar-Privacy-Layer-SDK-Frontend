import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { Network } from '@stellar-privacy/sdk';
import type { Note, ViewingKey } from '@stellar-privacy/sdk';
import {
  useWallet,
  useNetwork,
  useSDKReady,
  useViewingKeys,
  usePool,
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
      getWalletInfo: vi.fn((): unknown => null),
      disconnect: vi.fn(),
      setNetwork: vi.fn(),
      on: vi.fn(),
      removeListener: vi.fn(),
    },
    pool: {
      getNotes: vi.fn((): unknown[] => []),
      getTransactions: vi.fn((): unknown[] => []),
      deposit: vi.fn(),
      withdraw: vi.fn(),
      importNote: vi.fn(),
      refresh: vi.fn(),
      on: vi.fn(),
      removeListener: vi.fn(),
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
    pool = mocks.pool;
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

  it('sees a wallet that was connected before mounting', () => {
    mocks.wallet.getWalletInfo.mockReturnValueOnce({ publicKey, isConnected: true });
    const { result } = renderHook(() => useWallet());
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

describe('usePool', () => {
  const note = { commitment: '0x1' } as Note;

  it('follows pool changes', async () => {
    const { result, unmount } = renderHook(() => usePool());
    await waitFor(() => expect(mocks.pool.on).toHaveBeenCalled());
    mocks.pool.getNotes.mockReturnValue([note]);
    act(() => mocks.pool.on.mock.calls.at(-1)![1]());
    expect(result.current.notes).toEqual([note]);
    unmount();
    expect(mocks.pool.removeListener).toHaveBeenCalled();
  });

  it('forwards actions', async () => {
    const { result } = renderHook(() => usePool());
    await act(async () => {
      await result.current.deposit();
      await result.current.withdraw(note, publicKey);
      await result.current.importNote('backup');
    });
    expect(mocks.pool.deposit).toHaveBeenCalled();
    expect(mocks.pool.withdraw).toHaveBeenCalledWith('0x1', publicKey);
    expect(mocks.pool.importNote).toHaveBeenCalledWith('backup');
  });

  it('surfaces action errors and swallows refresh errors', async () => {
    mocks.pool.deposit.mockRejectedValueOnce(new Error('declined'));
    mocks.pool.refresh.mockRejectedValueOnce(new Error('offline'));
    const { result } = renderHook(() => usePool());
    await act(async () => {
      await expect(result.current.deposit()).rejects.toThrow('declined');
      await result.current.refresh();
    });
    expect(result.current.error).toBe('declined');
  });
});
