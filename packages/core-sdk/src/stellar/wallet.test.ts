import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WalletManager } from './wallet';
import { Network } from '../types';

const mockFreighter = {
  isConnected: vi.fn(),
  getAddress: vi.fn(),
  signTransaction: vi.fn(),
  getNetwork: vi.fn(),
};

describe('WalletManager', () => {
  let wallet: WalletManager;

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubGlobal('window', { stellar: { freighter: mockFreighter } });

    mockFreighter.isConnected.mockResolvedValue({ isConnected: true });
    mockFreighter.getAddress.mockResolvedValue({ address: 'GA' + 'X'.repeat(54) });
    mockFreighter.getNetwork.mockResolvedValue({
      network: 'TESTNET',
      networkPassphrase: 'Test SDF Network ; September 2015',
    });
    mockFreighter.signTransaction.mockResolvedValue({
      signedTxXdr: 'AAAA...',
      signerAddress: 'GA' + 'X'.repeat(54),
    });

    wallet = new WalletManager();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reports disconnected initially', () => {
    expect(wallet.isConnected()).toBe(false);
    expect(wallet.getWalletInfo()).toBeNull();
    expect(wallet.getPublicKey()).toBeNull();
  });

  it('connects via freighter and stores wallet info', async () => {
    const info = await wallet.connect();
    expect(info.publicKey).toBe('GA' + 'X'.repeat(54));
    expect(info.isConnected).toBe(true);
    expect(info.network).toBe(Network.TESTNET);
    expect(wallet.getPublicKey()).toBe('GA' + 'X'.repeat(54));
    expect(wallet.isConnected()).toBe(true);
  });

  it('throws when freighter is locked', async () => {
    mockFreighter.isConnected.mockResolvedValue({ isConnected: false });
    await expect(wallet.connect()).rejects.toThrow('Freighter is not connected');
  });

  it('throws when address is missing', async () => {
    mockFreighter.getAddress.mockResolvedValue({ address: '' });
    await expect(wallet.connect()).rejects.toThrow('Failed to get public key from Freighter');
  });

  it('throws a useful error when freighter is missing', async () => {
    vi.stubGlobal('window', undefined);
    await expect(wallet.connect()).rejects.toThrow();
  });

  it('maps freighter networks to the Network enum', async () => {
    mockFreighter.getNetwork.mockResolvedValue({
      network: 'PUBLIC',
      networkPassphrase: 'Public Global Stellar Network ; September 2015',
    });
    const publicInfo = await wallet.connect();
    expect(publicInfo.network).toBe(Network.PUBLIC);

    mockFreighter.getNetwork.mockResolvedValue({ network: 'futurenet', networkPassphrase: 'x' });
    const futureInfo = await wallet.connect();
    expect(futureInfo.network).toBe(Network.FUTURENET);

    mockFreighter.getNetwork.mockResolvedValue({ network: 'UNKNOWN_NET', networkPassphrase: 'x' });
    const fallbackInfo = await wallet.connect();
    expect(fallbackInfo.network).toBe(Network.SANDBOX);
  });

  it('disconnects and clears wallet info', async () => {
    await wallet.connect();
    wallet.disconnect();
    expect(wallet.isConnected()).toBe(false);
    expect(wallet.getWalletInfo()).toBeNull();
  });

  it('signs a transaction through freighter', async () => {
    await wallet.connect();
    const signed = await wallet.signTransaction('AAAA');
    expect(signed).toBe('AAAA...');
    expect(mockFreighter.signTransaction).toHaveBeenCalledWith('AAAA', {
      networkPassphrase: 'Test SDF Network ; September 2015',
    });
  });

  it('throws when signing without a connection', async () => {
    await expect(wallet.signTransaction('AAAA')).rejects.toThrow('Wallet not connected');
  });

  it('detects the freighter module when installed', async () => {
    expect(await wallet.isFreighterInstalled()).toBe(true);
  });

  it('rejects unsupported wallet providers', async () => {
    await expect(wallet.connect('xbull')).rejects.toThrow('not yet supported');
  });

  it('honours an explicit provider argument', async () => {
    const info = await wallet.connect('freighter');
    expect(info.isConnected).toBe(true);
  });

  it('setNetwork updates the signing network passphrase', async () => {
    wallet.setNetwork(Network.PUBLIC);
    await wallet.connect();
    await wallet.signTransaction('AAAA');
    expect(mockFreighter.signTransaction).toHaveBeenCalledWith('AAAA', {
      networkPassphrase: 'Public Global Stellar Network ; September 2015',
    });
  });
});
