import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Keypair } from '@stellar/stellar-sdk';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ShieldedPool } from './shielded-pool.js';
import { decodeNote } from './note.js';
import { SnarkjsProver } from './snarkjs-prover.js';
import type { Prover } from './prover.js';
import { NotSubmittedError, type StellarClient } from '../stellar/client.js';
import { MerkleTree } from '../utils/merkle.js';
import { createMemoryStorageProvider } from '../utils/storage.js';
import { Network, type ZKProof } from '../types.js';

const CONTRACT = 'CPOOL';
const recipient = Keypair.random().publicKey();
const proof = { pi_a: ['1', '2'] } as unknown as ZKProof;

const rootOf = async (leaves: string[]) => {
  const tree = new MerkleTree();
  for (const leaf of leaves) await tree.append(leaf);
  return tree.root;
};

/** In-memory stand-in for the contract. */
function fakeChain() {
  const leaves: string[] = [];
  const spent = new Set<string>();
  const statuses: Record<string, string> = {};
  let counter = 0;
  const client = {
    getNetworkConfig: vi.fn(() => ({ network: Network.TESTNET, contractId: CONTRACT })),
    getPoolInfo: vi.fn(async () => ({
      token: 'CTOKEN', denomination: '1000000000', depositCount: leaves.length, root: await rootOf(leaves),
    })),
    getLeaves: vi.fn(async (start = 0) => leaves.slice(start)),
    isNullifierSpent: vi.fn(async (n: string) => spent.has(n)),
    getTransactionStatus: vi.fn(async (hash: string) => statuses[hash] ?? 'SUCCESS'),
    deposit: vi.fn(async (c: string) => {
      leaves.push(c);
      return `tx${counter++}`;
    }),
    withdraw: vi.fn(async (_p: ZKProof, _root: string, n: string, _to: string) => {
      spent.add(n);
      return `tx${counter++}`;
    }),
  };
  return { client, leaves, spent, statuses };
}

describe('ShieldedPool', () => {
  let chain: ReturnType<typeof fakeChain>;
  let storage: ReturnType<typeof createMemoryStorageProvider>;
  const prover: Prover = {
    initialize: async () => {},
    isReady: () => true,
    proveWithdrawal: vi.fn(async () => ({ proof, nullifier: '0x0' })),
  };
  const open = async (p: Prover | undefined = prover) => {
    const pool = new ShieldedPool(chain.client as unknown as StellarClient, p, storage);
    await pool.initialize();
    return pool;
  };

  beforeEach(() => {
    chain = fakeChain();
    storage = createMemoryStorageProvider();
  });

  it('deposits, withdraws and settles a note', async () => {
    const pool = await open();
    const { note } = await pool.deposit();
    expect(note).toMatchObject({ status: 'unconfirmed', token: 'CTOKEN' });
    expect(Number(note.amount)).toBe(100);
    await pool.refresh();
    expect(pool.getNotes()[0].status).toBe('available');

    await pool.withdraw(note.commitment, recipient);
    expect(chain.client.withdraw).toHaveBeenCalledWith(
      proof, expect.stringMatching(/^0x/), note.nullifier, recipient,
    );
    expect(pool.getNotes()[0].status).toBe('spending');
    await pool.refresh();
    expect(pool.getNotes()[0].status).toBe('spent');
    expect(pool.getTransactions().map((t) => t.status)).toEqual(['confirmed', 'confirmed']);
    await expect(pool.withdraw(note.commitment, recipient)).rejects.toThrow('already spent');
  });

  it('stores the secret before submitting and recovers a lost response', async () => {
    chain.client.deposit.mockImplementationOnce(async (c: string) => {
      expect(await storage.get('notes')).toContain(c);
      chain.leaves.push(c);
      throw new Error('timeout');
    });
    const pool = await open();
    await expect(pool.deposit()).rejects.toThrow('timeout');

    const reloaded = await open();
    await reloaded.refresh();
    expect(reloaded.getNotes()[0].status).toBe('available');
  });

  it('drops the note when the deposit was never submitted', async () => {
    chain.client.deposit.mockRejectedValueOnce(new NotSubmittedError('declined'));
    const pool = await open();
    await expect(pool.deposit()).rejects.toThrow('declined');
    expect(pool.getNotes()).toEqual([]);
  });

  it('expires lost transactions but trusts the contract over RPC history', async () => {
    vi.useFakeTimers();
    try {
      const pool = await open();
      const { note } = await pool.deposit();
      const { note: lost } = await pool.deposit();
      chain.leaves.pop();
      chain.client.getTransactionStatus.mockResolvedValue('NOT_FOUND');
      await pool.refresh();
      const byId = (c: string) => pool.getNotes().find((n) => n.commitment === c)!.status;
      expect(byId(note.commitment)).toBe('available');
      expect(byId(lost.commitment)).toBe('unconfirmed');
      vi.advanceTimersByTime(6 * 60_000);
      await pool.refresh();
      expect(byId(lost.commitment)).toBe('failed');
      expect(pool.getTransactions().map((t) => t.status).sort()).toEqual(['confirmed', 'failed']);
      chain.leaves.push(lost.commitment);
      await pool.refresh();
      expect(byId(lost.commitment)).toBe('available');
    } finally {
      vi.useRealTimers();
    }
  });

  it('makes a note available again when its withdrawal fails', async () => {
    const pool = await open();
    const { note } = await pool.deposit();
    await pool.refresh();
    const { txHash } = await pool.withdraw(note.commitment, recipient);
    chain.spent.clear();
    chain.statuses[txHash] = 'FAILED';
    await pool.refresh();
    expect(pool.getNotes()[0].status).toBe('available');
  });

  it('rejects withdrawals that cannot succeed', async () => {
    const pool = await open();
    const { note } = await pool.deposit();
    await expect(pool.withdraw('0x0', recipient)).rejects.toThrow('Note not found');
    await expect(pool.withdraw(note.commitment, 'bad')).rejects.toThrow('Invalid recipient');
    chain.leaves.length = 0;
    await expect(pool.withdraw(note.commitment, recipient)).rejects.toThrow('not confirmed');
    const bare = new ShieldedPool(chain.client as unknown as StellarClient, undefined, storage);
    await bare.initialize();
    await expect(bare.withdraw(note.commitment, recipient)).rejects.toThrow('No prover');
  });

  it('fetches only new commitments and recovers from a reset pool', async () => {
    const pool = await open();
    await pool.deposit();
    await pool.refresh();
    await pool.deposit();
    await Promise.all([pool.refresh(), pool.refresh()]);
    expect(chain.client.getLeaves.mock.calls.map(([start]) => start)).toEqual([0, 1]);
    chain.leaves.splice(0, 2, '0x5', '0x6');
    const { note } = await pool.deposit();
    chain.leaves.splice(0, 3, note.commitment, '0x7');
    await pool.withdraw(note.commitment, recipient);
    const { merkleProof } = vi.mocked(prover.proveWithdrawal).mock.lastCall![0];
    expect(merkleProof.root).toBe(await rootOf(chain.leaves));
  });

  it('withdraws through a relayer when configured', async () => {
    const relayer = { withdraw: vi.fn(async () => 'relayed') };
    const pool = new ShieldedPool(chain.client as unknown as StellarClient, prover, storage, relayer);
    const { note } = await pool.deposit();
    expect((await pool.withdraw(note.commitment, recipient)).txHash).toBe('relayed');
    expect(relayer.withdraw).toHaveBeenCalledWith(
      expect.objectContaining({ proof, nullifier: note.nullifier, recipient }),
    );
    expect(chain.client.withdraw).not.toHaveBeenCalled();
  });

  it('backs up and restores notes', async () => {
    const pool = await open();
    const { note } = await pool.deposit();
    const backup = pool.exportNote(note.commitment);
    expect(() => pool.exportNote('0x0')).toThrow('Note not found');

    storage = createMemoryStorageProvider();
    const other = await open();
    const restored = await other.importNote(backup);
    expect(restored).toMatchObject({ commitment: note.commitment, status: 'available' });
    await other.importNote(backup);
    expect(other.getNotes()).toHaveLength(1);
    await expect(other.importNote(backup.replace(CONTRACT, 'COTHER'))).rejects.toThrow(
      'different pool',
    );
    expect(() => decodeNote('nonsense')).toThrow('Invalid note');
  });

  it('only shows notes of the selected pool', async () => {
    const pool = await open();
    await pool.deposit();
    chain.client.getNetworkConfig.mockReturnValue({ network: Network.PUBLIC, contractId: CONTRACT });
    expect(pool.getNotes()).toEqual([]);
  });

  it('keeps a copy of corrupt state', async () => {
    const set = vi.spyOn(storage, 'set');
    await storage.set('notes', '{bad');
    expect((await open()).getNotes()).toEqual([]);
    expect(set).toHaveBeenCalledWith(expect.stringMatching(/^notes\.corrupt\./), '{bad');
  });

  const artifact = (name: string) =>
    fileURLToPath(new URL(`../../../../artifacts/${name}`, import.meta.url));

  // Needs `npm run build:circuits`.
  describe.skipIf(!existsSync(artifact('withdraw_final.zkey')))('with the real circuit', () => {
    it('produces a verified withdrawal proof', async () => {
      const real = new SnarkjsProver({
        wasm: artifact('withdraw.wasm'),
        zkey: artifact('withdraw_final.zkey'),
        vkey: JSON.parse(readFileSync(artifact('verification_key.json'), 'utf8')),
      });
      const prove = vi.spyOn(real, 'proveWithdrawal');
      const pool = await open(real);
      await pool.deposit();
      const { note } = await pool.deposit();
      await pool.deposit();
      await pool.withdraw(note.commitment, recipient);
      const result = await prove.mock.results[0].value;
      expect(result.nullifier).toBe(note.nullifier);

      const statement = prove.mock.calls[0][0];
      await expect(
        real.proveWithdrawal({ ...statement, secret: '0x1234' }),
      ).rejects.toThrow();
      const { curves } = (await import('snarkjs')) as unknown as {
        curves: { getCurveFromName(n: string): Promise<{ terminate(): Promise<void> }> };
      };
      await (await curves.getCurveFromName('bn128')).terminate();
    }, 60_000);
  });
});
