import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { StrKey, nativeToScVal, xdr } from '@stellar/stellar-sdk';
import { StellarClient } from './client.js';
import { NETWORK_CONFIGS } from './config.js';
import { Network } from '../types.js';

const WALLET = StrKey.encodeEd25519PublicKey(Buffer.alloc(32, 0x02));
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

const signed = { signedTxXdr: 'AAAA...', signerAddress: 'GA' + 'X'.repeat(54) };
const { signTransaction } = vi.hoisted(() => ({ signTransaction: vi.fn() }));
vi.mock('@stellar/freighter-api', () => ({ signTransaction }));

describe('StellarClient', () => {
  let client: StellarClient;

  beforeAll(() => {
    client = new StellarClient();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    signTransaction.mockResolvedValue(signed);
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
    await c.connectWallet(WALLET, Network.PUBLIC);
    await expect(c.deposit('0x' + 'a'.repeat(64))).rejects.toThrow(
      'Contract not set',
    );
    expect(NETWORK_CONFIGS[Network.TESTNET].contractId).toBe('');
  });

  it('clears wallet on disconnect', () => {
    client.connectWallet(WALLET);
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
    client.connectWallet(WALLET);
    client.setContractId(validContractId);
    const result = await client.deposit('0x' + 'a'.repeat(64));
    expect(result).toBe('mock_hash');
  });

  it.each(['ERROR', 'TRY_AGAIN_LATER'])('throws when the network answers %s', async (status) => {
    serverBehaviors.sendTransaction = () => ({ status, hash: 'rejected' });
    client.connectWallet(WALLET);
    client.setContractId(validContractId);
    try {
      await expect(
        client.deposit('0x' + 'b'.repeat(64)),
      ).rejects.toThrow(status);
    } finally {
      serverBehaviors.sendTransaction = () => ({ status: 'PENDING', hash: 'mock_hash' });
    }
  });

  it('reports a rejected signature', async () => {
    signTransaction.mockResolvedValue({ ...signed, error: { code: -4, message: 'User declined' } });
    client.connectWallet(WALLET);
    client.setContractId(validContractId);
    await expect(
      client.deposit('0x' + 'a'.repeat(64)),
    ).rejects.toThrow('User declined');
  });

  it('throws when sending a transaction without a wallet', async () => {
    client.setContractId(validContractId);
    await expect(
      client.deposit('0x' + 'a'.repeat(64)),
    ).rejects.toThrow('Wallet not connected');
  });

  describe('pool contract', () => {
    const reply = (value: xdr.ScVal) => ({ status: 'SUCCESS', result: { retval: value } });
    const bytes = (n: number) => xdr.ScVal.scvBytes(Buffer.alloc(32, n));
    let previous: typeof serverBehaviors.simulateTransaction;

    beforeEach(async () => {
      previous = serverBehaviors.simulateTransaction;
      await client.connectWallet(WALLET);
      client.setContractId(validContractId);
    });
    afterEach(() => {
      serverBehaviors.simulateTransaction = previous;
    });

    it('decodes the pool info', async () => {
      serverBehaviors.simulateTransaction = () =>
        reply(
          nativeToScVal(
            { token: validContractId, denomination: 50n, next_index: 3, root: Buffer.alloc(32, 1) },
            {
              type: {
                token: ['symbol', 'address'],
                denomination: ['symbol', 'i128'],
                next_index: ['symbol', 'u32'],
                root: ['symbol', 'bytes'],
              },
            },
          ),
        );
      expect(await client.getPoolInfo()).toEqual({
        token: validContractId,
        denomination: '50',
        depositCount: 3,
        root: '0x' + '01'.repeat(32),
      });
    });

    it('reads leaves page by page', async () => {
      const pages = [[bytes(1), bytes(2)], [bytes(3)], []];
      serverBehaviors.simulateTransaction = () => reply(xdr.ScVal.scvVec(pages.shift()!));
      expect(await client.getLeaves()).toEqual(
        [1, 2, 3].map((n) => '0x' + `0${n}`.repeat(32)),
      );
    });

    it('checks nullifiers and submits withdrawals', async () => {
      serverBehaviors.simulateTransaction = () => reply(xdr.ScVal.scvBool(true));
      expect(await client.isNullifierSpent('0x1')).toBe(true);
      const proof = {
        pi_a: ['1', '2'] as [string, string],
        pi_b: [['3', '4'], ['5', '6']] as [[string, string], [string, string]],
        pi_c: ['7', '8'] as [string, string],
        protocol: 'groth16',
        curve: 'bn128',
      };
      expect(await client.withdraw(proof, '0x1', '0x2', WALLET)).toBe('mock_hash');
    });
  });

  it('throws when simulation fails', async () => {
    serverBehaviors.simulateTransaction = () => ({ status: 'ERROR' });
    client.connectWallet(WALLET);
    client.setContractId(validContractId);
    await expect(
      client.deposit('0x' + 'a'.repeat(64)),
    ).rejects.toThrow('simulation failed');
  });

  describe('getAccountBalance', () => {
    afterEach(() => vi.unstubAllGlobals());

    it('reads the native balance from Horizon', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          balances: [
            { asset_type: 'credit_alphanum4', balance: '5.0' },
            { asset_type: 'native', balance: '123.4560000' },
          ],
        }),
      });
      vi.stubGlobal('fetch', fetchMock);
      expect(await client.getAccountBalance('GABC')).toBe('123.4560000');
      expect(fetchMock).toHaveBeenCalledWith(
        `${client.getNetworkConfig().horizonUrl}/accounts/GABC`,
      );
    });

    it('returns 0 without a native balance', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
      expect(await client.getAccountBalance('GABC')).toBe('0');
    });

    it('returns 0 when the account does not exist', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));
      expect(await client.getAccountBalance('GABC')).toBe('0');
    });
  });

  it('returns not_found when getTransactionStatus fails', async () => {
    serverBehaviors.getTransaction = () => { throw new Error('rpc error'); };
    const status = await client.getTransactionStatus('0xabc');
    expect(status).toBe('not_found');
    serverBehaviors.getTransaction = () => ({ status: 'SUCCESS' });
  });
});
