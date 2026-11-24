import { EventEmitter } from 'events';
import { recipientField } from '../stellar/abi.js';
import { NotSubmittedError, type StellarClient } from '../stellar/client.js';
import type { PoolInfo, ShieldedTransaction, StorageProvider } from '../types.js';
import { generateRandomField } from '../utils/crypto.js';
import { formatUnits, isValidPublicKey } from '../utils/encoding.js';
import { logger } from '../utils/logger.js';
import { MerkleTree } from '../utils/merkle.js';
import { createLocalStorageProvider } from '../utils/storage.js';
import { decodeNote, deriveNote, encodeNote, type Note } from './note.js';
import type { Relayer } from './relayer.js';
import type { Prover } from './prover.js';

const NOTES_KEY = 'notes';
const TRANSACTIONS_KEY = 'transactions';
const TOKEN_DECIMALS = 7;
/** Transactions are valid for 30 seconds; after this they cannot succeed. */
const EXPIRY_MS = 5 * 60_000;

/**
 * Deposits to and withdrawals from the shielded pool contract.
 *
 * Note secrets are kept in `storage` unencrypted: losing them loses the funds,
 * and leaking them lets others spend. Emits `change` when state changes.
 */
export class ShieldedPool extends EventEmitter {
  private notes: Note[] = [];
  private transactions: ShieldedTransaction[] = [];
  private trees = new Map<string, MerkleTree>();
  private syncing: Promise<unknown> = Promise.resolve();

  constructor(
    private client: StellarClient,
    private prover?: Prover,
    private storage: StorageProvider = createLocalStorageProvider(),
    private relayer?: Relayer,
  ) {
    super();
  }

  async initialize(): Promise<void> {
    this.notes = await this.load<Note>(NOTES_KEY);
    this.transactions = await this.load<ShieldedTransaction>(TRANSACTIONS_KEY);
  }

  private async load<T>(key: string): Promise<T[]> {
    const json = await this.storage.get(key);
    if (!json) return [];
    try {
      return JSON.parse(json) as T[];
    } catch (error) {
      // Keep the unreadable value: it may hold recoverable note secrets.
      await this.storage.set(`${key}.corrupt.${Date.now()}`, json);
      logger.error('Stored state is corrupt; a copy was kept', { key, error: String(error) });
      return [];
    }
  }

  private async save(): Promise<void> {
    await this.storage.set(NOTES_KEY, JSON.stringify(this.notes));
    await this.storage.set(TRANSACTIONS_KEY, JSON.stringify(this.transactions));
    this.emit('change');
  }

  /** Fetches only new commitments, unless the pool changed underneath. */
  private async syncTree(): Promise<MerkleTree> {
    const { network, contractId } = this.client.getNetworkConfig();
    const id = `${network}:${contractId}`;
    // Serialized so concurrent calls cannot append the same leaves twice.
    const result = this.syncing.then(async () => {
      let tree = this.trees.get(id) ?? new MerkleTree();
      const { root, depositCount } = await this.client.getPoolInfo();
      if (depositCount < tree.leaves.length || (depositCount === tree.leaves.length && depositCount > 0 && root !== tree.root)) {
        tree = new MerkleTree(); // e.g. a testnet reset
      }
      if (depositCount > tree.leaves.length) {
        for (const leaf of await this.client.getLeaves(tree.leaves.length)) await tree.append(leaf);
      }
      this.trees.set(id, tree);
      return tree;
    });
    this.syncing = result.catch(() => {});
    return result;
  }

  getInfo(): Promise<PoolInfo> {
    return this.client.getPoolInfo();
  }

  /** Notes of the currently selected pool, newest first. */
  getNotes(): Note[] {
    const { network, contractId } = this.client.getNetworkConfig();
    return this.notes
      .filter((n) => n.network === network && n.contractId === contractId)
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  getTransactions(): ShieldedTransaction[] {
    return [...this.transactions].sort((a, b) => b.timestamp - a.timestamp);
  }

  private async createNote(secret: string, status: Note['status']): Promise<Note> {
    const { network, contractId } = this.client.getNetworkConfig();
    const info = await this.client.getPoolInfo();
    return {
      secret,
      ...(await deriveNote(secret)),
      network,
      contractId,
      token: info.token,
      amount: formatUnits(info.denomination, TOKEN_DECIMALS),
      status,
      timestamp: Date.now(),
    };
  }

  private record(type: ShieldedTransaction['type'], note: Note, txHash: string, recipient?: string) {
    this.transactions.push({
      type,
      txHash,
      commitmentHash: note.commitment,
      nullifier: note.nullifier,
      amount: note.amount,
      token: note.token,
      recipient,
      timestamp: Date.now(),
      status: 'pending',
    });
  }

  /** Deposits one denomination. The note is stored before anything is sent. */
  async deposit(): Promise<{ txHash: string; note: Note }> {
    const note = await this.createNote(await generateRandomField(), 'unconfirmed');
    this.notes.push(note);
    await this.save();
    let txHash: string;
    try {
      txHash = await this.client.deposit(note.commitment);
    } catch (error) {
      // Otherwise the transaction may have been accepted: refresh() decides.
      if (error instanceof NotSubmittedError) {
        this.notes = this.notes.filter((n) => n !== note);
        await this.save();
      }
      throw error;
    }
    this.record('deposit', note, txHash);
    await this.save();
    return { txHash, note };
  }

  /** Withdraws a whole note to `recipient`. */
  async withdraw(commitment: string, recipient: string): Promise<{ txHash: string }> {
    const note = this.getNotes().find((n) => n.commitment === commitment);
    if (!note) throw new Error('Note not found');
    if (note.status === 'spent') throw new Error('Note is already spent');
    if (!isValidPublicKey(recipient)) {
      throw new Error('Invalid recipient: must be a valid Stellar public key (G...)');
    }
    if (!this.prover) throw new Error('No prover configured');

    const tree = await this.syncTree();
    const index = tree.leaves.indexOf(note.commitment);
    if (index === -1) throw new Error('The deposit is not confirmed on-chain yet');

    const merkleProof = tree.prove(index);
    const { proof } = await this.prover.proveWithdrawal({
      secret: note.secret,
      merkleProof,
      recipient: recipientField(recipient),
    });
    const request = { proof, root: merkleProof.root, nullifier: note.nullifier, recipient };
    const txHash = this.relayer
      ? await this.relayer.withdraw(request)
      : await this.client.withdraw(proof, request.root, request.nullifier, recipient);
    note.status = 'spending';
    this.record('withdrawal', note, txHash, recipient);
    await this.save();
    return { txHash };
  }

  /**
   * Reconciles notes and pending transactions with the network. The contract's
   * state decides; RPC history only lasts about a day.
   */
  async refresh(): Promise<void> {
    const before = JSON.stringify([this.notes, this.transactions]);
    const expired = (timestamp: number) => Date.now() - timestamp > EXPIRY_MS;
    const notes = this.getNotes();
    const unsettled = new Set(
      this.transactions.filter((t) => t.status === 'pending').map((t) => t.commitmentHash),
    );
    const open = notes.filter((n) => n.status !== 'spent' || unsettled.has(n.commitment));
    const inPool = open.length > 0 ? new Set((await this.syncTree()).leaves) : new Set<string>();

    for (const note of open) {
      const deposited = inPool.has(note.commitment);
      const spent = deposited && (await this.client.isNullifierSpent(note.nullifier));
      for (const tx of this.transactions) {
        if (tx.commitmentHash !== note.commitment || tx.status !== 'pending') continue;
        if (tx.type === 'deposit' ? deposited : spent) {
          tx.status = 'confirmed';
          continue;
        }
        const status = await this.client.getTransactionStatus(tx.txHash);
        if (status === 'FAILED' || (status === 'NOT_FOUND' && expired(tx.timestamp))) {
          tx.status = 'failed';
        }
      }
      if (spent) note.status = 'spent';
      else if (!deposited) {
        note.status = expired(note.timestamp) ? 'failed' : 'unconfirmed';
      } else {
        const withdrawing = this.transactions.some(
          (t) =>
            t.type === 'withdrawal' && t.commitmentHash === note.commitment && t.status === 'pending',
        );
        note.status = withdrawing ? 'spending' : 'available';
      }
    }
    if (JSON.stringify([this.notes, this.transactions]) !== before) await this.save();
  }

  /** Returns a backup string. Anyone holding it can spend the note. */
  exportNote(commitment: string): string {
    const note = this.notes.find((n) => n.commitment === commitment);
    if (!note) throw new Error('Note not found');
    return encodeNote(note);
  }

  /** Restores a note from a backup made for the currently selected pool. */
  async importNote(text: string): Promise<Note> {
    const { network, contractId, secret } = decodeNote(text);
    const current = this.client.getNetworkConfig();
    if (network !== current.network || contractId !== current.contractId) {
      throw new Error('This note belongs to a different pool or network');
    }
    const note = await this.createNote(secret, 'unconfirmed');
    const existing = this.notes.find((n) => n.commitment === note.commitment);
    if (existing) return existing;
    this.notes.push(note);
    await this.save();
    await this.refresh();
    return note;
  }
}
