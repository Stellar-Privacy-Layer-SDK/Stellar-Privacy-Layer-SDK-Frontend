import { describe, it, expect, beforeAll, vi } from 'vitest';
import { ShieldedTransfer } from './shielded-transfer';
import { StellarClient } from '../stellar/client';
import { createMemoryStorageProvider } from '../utils/storage';
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
    SorobanRpc: {
      Server: MockServer,
      Api: {
        isSimulationSuccess: () => true,
        isSimulationError: () => false,
        isSimulationRestore: () => false,
        isSimulationRaw: () => false,
      },
      assembleTransaction: () => ({ toXDR: () => 'AAAA...' }),
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
    transfer = new ShieldedTransfer(client, createMemoryStorageProvider());
    await transfer.initialize();
  });

  it('returns a valid result on deposit', async () => {
    const result = await transfer.deposit({
      amount: '100',
      token: 'USDC',
      recipient: 'GA' + 'R'.repeat(54),
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
      amount: '200', token: 'USDC', recipient: 'GA' + 'A'.repeat(54),
    });
    const b = await transfer.deposit({
      amount: '300', token: 'XLM', recipient: 'GA' + 'B'.repeat(54),
    });
    expect(a.commitmentHash).not.toBe(b.commitmentHash);
  });

  it('emits onTransferCompleted event', async () => {
    const handler = vi.fn();
    transfer.on('onTransferCompleted', handler);
    await transfer.deposit({
      amount: '50', token: 'USDC', recipient: 'GA' + 'C'.repeat(54),
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
    const t1 = new ShieldedTransfer(client, storage);
    await t1.initialize();
    await t1.deposit({ amount: '42', token: 'USDC', recipient: 'GA' + 'P'.repeat(54) });

    const t2 = new ShieldedTransfer(client, storage);
    await t2.initialize();
    const history = await t2.getTransactionHistory();
    expect(history.some((tx) => tx.amount === '42')).toBe(true);
  });
});
