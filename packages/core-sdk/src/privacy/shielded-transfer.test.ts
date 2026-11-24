import { describe, it, expect, beforeAll, vi } from 'vitest';
import { Keypair } from '@stellar/stellar-sdk';
import { ShieldedTransfer } from './shielded-transfer';
import { StellarClient } from '../stellar/client';
import { NETWORK_CONFIGS } from '../stellar/config';
import { Network } from '../types';
import { createMemoryStorageProvider } from '../utils/storage';

const KEY = () => Keypair.random().publicKey();
vi.mock('@stellar/stellar-sdk', async () => {
  const actual = await vi.importActual('@stellar/stellar-sdk');
  class MockServer {
    getAccount() { return { accountId: () => 'GA' + 'X'.repeat(54) }; }
    simulateTransaction() { return { status: 'SUCCESS' }; }
    sendTransaction() { return { status: 'SUCCESS', hash: 'mock_hash' }; }
    getTransaction() { return { status: 'SUCCESS' }; }
    getLedgerEntries() { return { entries: [] }; }
  }
  return {
    ...actual,
    rpc: {
      Server: MockServer,
      Api: {
        isSimulationSuccess: () => true,
        isSimulationError: () => false,
        isSimulationRestore: () => false,
        isSimulationRaw: () => false,
      },
      assembleTransaction: () => ({
        build: () => ({ toEnvelope: () => ({ toXDR: () => 'AAAA...' }) }),
      }),
    },
    TransactionBuilder: { fromXDR: () => ({}) },
  };
});

const validContractId = 'CAAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQC526';

describe('ShieldedTransfer', () => {
  let transfer: ShieldedTransfer;
  let client: StellarClient;

  beforeAll(async () => {
    client = new StellarClient();
    client.connectWallet('GA' + 'X'.repeat(54));
    client.setContractId(validContractId);
    transfer = new ShieldedTransfer(client, createMemoryStorageProvider(), undefined, {
      simulateOnFailure: true,
    });
    await transfer.initialize();
  });

  it('returns a valid result on deposit', async () => {
    const result = await transfer.deposit({
      amount: '100',
      token: 'USDC',
      recipient: KEY(),
    });

    expect(result.txHash).toBeTruthy();
    expect(result.commitmentHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(result.nullifier).toMatch(/^0x[0-9a-f]{64}$/);
    expect(result.status).toBe('pending');
  });

  it('persists transactions to storage', async () => {
    const history = await transfer.getTransactionHistory();
    expect(history.length).toBeGreaterThanOrEqual(1);
  });

  it('different deposits have different commitments', async () => {
    const a = await transfer.deposit({
      amount: '200', token: 'USDC', recipient: KEY(),
    });
    const b = await transfer.deposit({
      amount: '300', token: 'XLM', recipient: KEY(),
    });
    expect(a.commitmentHash).not.toBe(b.commitmentHash);
  });

  it('emits onTransferCompleted event', async () => {
    const handler = vi.fn();
    transfer.on('onTransferCompleted', handler);
    await transfer.deposit({
      amount: '50', token: 'USDC', recipient: KEY(),
    });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('sorts history by timestamp descending', async () => {
    const history = await transfer.getTransactionHistory();
    for (let i = 1; i < history.length; i++) {
      expect(history[i - 1].timestamp).toBeGreaterThanOrEqual(history[i].timestamp);
    }
  });

  it('returns 0 balance when wallet reports', async () => {
    const balance = await transfer.getBalance();
    expect(balance).toBeTruthy();
    expect(typeof balance).toBe('string');
  });

  it('restores state from storage', async () => {
    const storage = createMemoryStorageProvider();
    const t1 = new ShieldedTransfer(client, storage, undefined, { simulateOnFailure: true });
    await t1.initialize();
    await t1.deposit({ amount: '42', token: 'USDC', recipient: KEY() });

    const t2 = new ShieldedTransfer(client, storage, undefined, { simulateOnFailure: true });
    await t2.initialize();
    const history = await t2.getTransactionHistory();
    expect(history.some((tx) => tx.amount === '42')).toBe(true);
  });

  it('fails the deposit when it cannot be submitted', async () => {
    const strict = new ShieldedTransfer(client, createMemoryStorageProvider());
    await strict.initialize();
    const failed = vi.fn();
    strict.on('onTransferFailed', failed);
    await expect(
      strict.deposit({ amount: '1', token: 'USDC', recipient: KEY() }),
    ).rejects.toThrow();
    expect(failed).toHaveBeenCalledTimes(1);
    expect(await strict.getTransactionHistory()).toEqual([]);
  });

  it('refuses the simulated prover on the public network', async () => {
    const mainnet = new StellarClient({ network: NETWORK_CONFIGS[Network.PUBLIC] });
    const t = new ShieldedTransfer(mainnet, createMemoryStorageProvider(), undefined, {
      simulateOnFailure: true,
    });
    await expect(t.deposit({ amount: '1', token: 'USDC', recipient: KEY() })).rejects.toThrow(
      'simulated prover is insecure',
    );
    await expect(t.withdraw('0x1', KEY(), '1')).rejects.toThrow('simulated prover is insecure');
  });

  describe('input validation', () => {
    it('rejects invalid amounts', async () => {
      await expect(
        transfer.deposit({ amount: '0', token: 'USDC', recipient: KEY() }),
      ).rejects.toThrow('Invalid amount');
      await expect(
        transfer.deposit({ amount: 'abc', token: 'USDC', recipient: KEY() }),
      ).rejects.toThrow('Invalid amount');
    });

    it('rejects invalid recipient keys', async () => {
      await expect(
        transfer.deposit({ amount: '10', token: 'USDC', recipient: 'not-a-key' }),
      ).rejects.toThrow('Invalid recipient');
    });

    it('rejects missing or oversized tokens', async () => {
      await expect(
        transfer.deposit({ amount: '10', token: '', recipient: KEY() }),
      ).rejects.toThrow('Invalid token');
      await expect(
        transfer.deposit({ amount: '10', token: 'T'.repeat(65), recipient: KEY() }),
      ).rejects.toThrow('Invalid token');
    });
  });

  describe('withdraw', () => {
    it('throws when the commitment does not exist', async () => {
      await expect(
        transfer.withdraw('0x' + 'f'.repeat(64), KEY(), '10'),
      ).rejects.toThrow('Commitment not found');
    });

    it('withdraws a deposited commitment', async () => {
      const deposit = await transfer.deposit({
        amount: '150', token: 'USDC', recipient: KEY(),
      });
      const result = await transfer.withdraw(
        deposit.commitmentHash,
        KEY(),
        '150',
      );
      expect(result.txHash).toBeTruthy();
      expect(result.nullifier).toBe(deposit.nullifier);
      const history = await transfer.getTransactionHistory();
      expect(history.find((tx) => tx.txHash === result.txHash)?.type).toBe('withdrawal');
      expect(await transfer.getCommitment(deposit.commitmentHash)).toBeUndefined();
    });

    it('rejects amounts that differ from the deposit', async () => {
      const deposit = await transfer.deposit({ amount: '20', token: 'USDC', recipient: KEY() });
      await expect(transfer.withdraw(deposit.commitmentHash, KEY(), '2000')).rejects.toThrow(
        'must equal the deposited amount',
      );
    });

    it('rejects invalid withdraw recipients', async () => {
      const deposit = await transfer.deposit({
        amount: '15', token: 'USDC', recipient: KEY(),
      });
      await expect(
        transfer.withdraw(deposit.commitmentHash, 'bad-key', '15'),
      ).rejects.toThrow('Invalid recipient');
    });

    it('passes a real Merkle proof to the contract on withdraw', async () => {
      // Two commitments so the Merkle path is non-trivial.
      const a = await transfer.deposit({
        amount: '111', token: 'USDC', recipient: KEY(),
      });
      await transfer.deposit({
        amount: '222', token: 'USDC', recipient: KEY(),
      });

      let capturedProof: string[] = [];
      const originalWithdraw = client.withdrawCommitment.bind(client);
      client.withdrawCommitment = async (_nullifier, merkleProof) => {
        capturedProof = merkleProof;
        return 'mock_hash';
      };
      try {
        const result = await transfer.withdraw(a.commitmentHash, KEY(), '111');
        expect(result.txHash).toBe('mock_hash');
      } finally {
        client.withdrawCommitment = originalWithdraw;
      }

      expect(capturedProof.length).toBeGreaterThan(0);
      expect(capturedProof[0]).toMatch(/^0x[0-9a-f]{64}$/);
    });
  });

  it('updates and persists pending transaction statuses', async () => {
    const storage = createMemoryStorageProvider();
    const t = new ShieldedTransfer(client, storage);
    await t.initialize();
    const submit = vi.spyOn(client, 'depositCommitment');
    const status = vi.spyOn(client, 'getTransactionStatus');
    try {
      for (const hash of ['ok', 'bad', 'unknown']) {
        submit.mockResolvedValueOnce(hash);
        await t.deposit({ amount: '1', token: 'USDC', recipient: KEY() });
      }
      status.mockImplementation(
        async (hash) => ({ ok: 'SUCCESS', bad: 'FAILED' })[hash] ?? 'NOT_FOUND',
      );
      expect(await t.refreshPendingTransactions()).toBe(true);
      expect(await t.refreshPendingTransactions()).toBe(false);

      const reloaded = new ShieldedTransfer(client, storage);
      await reloaded.initialize();
      const byHash = Object.fromEntries(
        (await reloaded.getTransactionHistory()).map((tx) => [tx.txHash, tx.status]),
      );
      expect(byHash).toEqual({ ok: 'confirmed', bad: 'failed', unknown: 'pending' });
      expect(await reloaded.getCommitments()).toHaveLength(3);
    } finally {
      submit.mockRestore();
      status.mockRestore();
    }
  });

  it('returns the transaction status from the client', async () => {
    const status = await transfer.refreshTransactionStatus('0x' + 'e'.repeat(64));
    expect(status).toBe('SUCCESS');
  });
});
