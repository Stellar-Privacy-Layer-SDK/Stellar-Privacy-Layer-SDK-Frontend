import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { StrKey } from '@stellar/stellar-sdk';
import { StellarClient } from './client';
import { NETWORK_CONFIGS } from './config';
import { Network } from '../types';

const validContractId = StrKey.encodeContract(Buffer.alloc(32, 0x01));

const { serverBehaviors } = vi.hoisted(() => ({
  serverBehaviors: {} as Record<string, (...args: unknown[]) => unknown>,
}));

vi.mock('@stellar/stellar-sdk', async () => {
  const actual = await vi.importActual('@stellar/stellar-sdk');
  const { xdr } = actual;

  class MockTxBuilder {
    source: unknown;
    opts: unknown;
    op: unknown;
    timeout: number | undefined;
    constructor(source: unknown, opts: unknown) {
      this.source = source;
      this.opts = opts;
    }
    addOperation(op: unknown) { this.op = op; return this; }
    setTimeout(t: number) { this.timeout = t; return this; }
    build() { return {}; }
    static fromXDR = () => ({});
  }

  const scvTrue = xdr.ScVal.scvBool(true);

  // Default RPC behaviors; individual tests may override these.
  serverBehaviors.getAccount ??= () => ({ accountId: () => 'GA' + 'X'.repeat(54) });
  serverBehaviors.simulateTransaction ??= () => ({
    status: 'SUCCESS',
    result: { retval: scvTrue },
  });
  serverBehaviors.sendTransaction ??= () => ({ status: 'SUCCESS', hash: 'mock_hash' });
  serverBehaviors.getTransaction ??= () => ({ status: 'SUCCESS' });
  serverBehaviors.getLedgerEntries ??= () => ({ entries: [] });

  return {
    ...actual,
    rpc: {
      Server: class {
        getAccount(...args: unknown[]) { return serverBehaviors.getAccount(...args); }
        simulateTransaction(...args: unknown[]) { return serverBehaviors.simulateTransaction(...args); }
        sendTransaction() { return serverBehaviors.sendTransaction(); }
        getTransaction() { return serverBehaviors.getTransaction(); }
        getLedgerEntries() { return serverBehaviors.getLedgerEntries(); }
      },
      Api: {
        isSimulationSuccess: (sim: unknown) =>
          (sim as { status?: string } | null)?.status === 'SUCCESS',
        isSimulationError: () => false,
        isSimulationRestore: () => false,
        isSimulationRaw: () => false,
      },
      assembleTransaction: () => ({
        build: () => ({ toEnvelope: () => ({ toXDR: () => 'AAAA...' }) }),
      }),
    },
    TransactionBuilder: MockTxBuilder,
  };
});

vi.mock('@stellar/freighter-api', () => ({
  signTransaction: () => Promise.resolve({
    signedTxXdr: 'AAAA...', signerAddress: 'GA' + 'X'.repeat(54),
  }),
}));

describe('StellarClient', () => {
  let client: StellarClient;

  beforeAll(() => {
    client = new StellarClient();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    client.disconnectWallet();
  });

  it('initializes with testnet config', () => {
    const cfg = client.getNetworkConfig();
    expect(cfg.network).toBe(Network.TESTNET);
    expect(cfg.rpcUrl).toContain('testnet');
  });

  it('reports disconnected initially', () => {
    expect(client.isConnected()).toBe(false);
    expect(client.getWalletInfo()).toBeNull();
  });

  it('connects and stores wallet info', async () => {
    const info = await client.connectWallet('GA' + 'X'.repeat(54), Network.TESTNET);
    expect(info.publicKey).toBe('GA' + 'X'.repeat(54));
    expect(info.isConnected).toBe(true);
    expect(info.network).toBe(Network.TESTNET);
    expect(client.isConnected()).toBe(true);
  });

  it('rejects an empty public key on connect', async () => {
    await expect(client.connectWallet('', Network.TESTNET)).rejects.toThrow(
      'public key is required',
    );
  });

  it('changes the network config', () => {
    client.switchNetwork(Network.PUBLIC);
    expect(client.getNetworkConfig().network).toBe(Network.PUBLIC);
    client.switchNetwork(Network.TESTNET);
  });

  it('keeps custom endpoints and contract across wallet connect and network switches', async () => {
    const c = new StellarClient({
      network: {
        ...NETWORK_CONFIGS[Network.TESTNET],
        rpcUrl: 'https://rpc.example.com',
        contractId: validContractId,
      },
    });
    await c.connectWallet('GA' + 'X'.repeat(54), Network.TESTNET);
    expect(c.getNetworkConfig().rpcUrl).toBe('https://rpc.example.com');
    c.switchNetwork(Network.PUBLIC);
    expect(c.getNetworkConfig().contractId).toBe('');
    c.switchNetwork(Network.TESTNET);
    expect(c.getNetworkConfig().contractId).toBe(validContractId);
  });

  it('does not reuse a contract from another network', async () => {
    const c = new StellarClient();
    c.setContractId(validContractId);
    await c.connectWallet('GA' + 'X'.repeat(54), Network.PUBLIC);
    await expect(c.depositCommitment('0x' + 'a'.repeat(64), '1', 'USDC')).rejects.toThrow(
      'Contract not set',
    );
    expect(NETWORK_CONFIGS[Network.TESTNET].contractId).toBe('');
  });

  it('clears wallet on disconnect', () => {
    client.connectWallet('GA' + 'X'.repeat(54));
    client.disconnectWallet();
    expect(client.isConnected()).toBe(false);
    expect(client.getWalletInfo()).toBeNull();
  });

  it('sets contract id without error', () => {
    expect(() => client.setContractId(validContractId)).not.toThrow();
  });

  it('rejects an empty contract id', () => {
    expect(() => client.setContractId('')).toThrow('Contract ID is required');
  });

  it('returns the transaction hash from sendTransaction', async () => {
    client.connectWallet('GA' + 'X'.repeat(54));
    client.setContractId(validContractId);
    const result = await client.depositCommitment('0x' + 'a'.repeat(64), '100', 'USDC');
    expect(result).toBe('mock_hash');
  });

  it('falls back to status when no hash is returned', async () => {
    serverBehaviors.sendTransaction = () => ({ status: 'PENDING' });
    client.connectWallet('GA' + 'X'.repeat(54));
    client.setContractId(validContractId);
    const result = await client.withdrawCommitment(
      '0x' + 'b'.repeat(64), ['0x' + 'c'.repeat(64)], 'GA' + 'X'.repeat(54), '{}',
    );
    expect(result).toBe('PENDING');
    serverBehaviors.sendTransaction = () => ({ status: 'SUCCESS', hash: 'mock_hash' });
  });

  it('throws when sending a transaction without a wallet', async () => {
    client.setContractId(validContractId);
    await expect(
      client.depositCommitment('0x' + 'a'.repeat(64), '100', 'USDC'),
    ).rejects.toThrow('Wallet not connected');
  });

  it('verifies proof via contract call', async () => {
    client.connectWallet('GA' + 'X'.repeat(54));
    client.setContractId(validContractId);
    const result = await client.verifyProof(JSON.stringify({ pi_a: ['1', '2'] }), ['input1']);
    expect(result).toBe(true);
  });

  it('throws when simulation fails', async () => {
    serverBehaviors.simulateTransaction = () => ({ status: 'ERROR' });
    client.connectWallet('GA' + 'X'.repeat(54));
    client.setContractId(validContractId);
    await expect(
      client.depositCommitment('0x' + 'a'.repeat(64), '100', 'USDC'),
    ).rejects.toThrow('simulation failed');
  });

  it('returns 0 balance when the account lookup fails', async () => {
    serverBehaviors.getAccount = () => { throw new Error('account not found'); };
    const balance = await client.getAccountBalance('GA' + 'X'.repeat(54));
    expect(balance).toBe('0');
  });

  it('returns 0 balance when account has no balance field', async () => {
    serverBehaviors.getAccount = () => ({ accountId: () => 'GA' + 'X'.repeat(54) });
    const balance = await client.getAccountBalance('GA' + 'X'.repeat(54));
    expect(balance).toBe('0');
    serverBehaviors.getAccount = () => ({ accountId: () => 'GA' + 'X'.repeat(54) });
  });

  it('reads the account balance when present', async () => {
    serverBehaviors.getAccount = () => ({
      balance: '123.456',
      accountId: () => 'GA' + 'X'.repeat(54),
    });
    const balance = await client.getAccountBalance('GA' + 'X'.repeat(54));
    expect(balance).toBe('123.456');
    serverBehaviors.getAccount = () => ({ accountId: () => 'GA' + 'X'.repeat(54) });
  });

  it('returns not_found when getTransactionStatus fails', async () => {
    serverBehaviors.getTransaction = () => { throw new Error('rpc error'); };
    const status = await client.getTransactionStatus('0xabc');
    expect(status).toBe('not_found');
    serverBehaviors.getTransaction = () => ({ status: 'SUCCESS' });
  });
});
