import { EventEmitter } from 'events';
import { recipientField } from '../stellar/abi.js';
import type { StellarClient } from '../stellar/client.js';
import type { PoolInfo, ShieldedTransaction, StorageProvider } from '../types.js';
import { generateRandomField } from '../utils/crypto.js';
import { formatUnits, isValidPublicKey } from '../utils/encoding.js';
import { logger } from '../utils/logger.js';
import { buildMerkleProof } from '../utils/merkle.js';
import { createLocalStorageProvider } from '../utils/storage.js';
import { decodeNote, deriveNote, encodeNote, type Note } from './note.js';
import type { Prover } from './prover.js';

const NOTES_KEY = 'notes';
const TRANSACTIONS_KEY = 'transactions';
const TOKEN_DECIMALS = 7;

/**
 * Deposits to and withdrawals from the shielded pool contract.
 *
 * Note secrets are kept in `storage` unencrypted: losing them loses the funds,
 * and leaking them lets others spend. Emits `change` when state changes.
 */
export class ShieldedPool extends EventEmitter {
  private notes: Note[] = [];
  private transactions: ShieldedTransaction[] = [];

  constructor(
    private client: StellarClient,
    private prover?: Prover,
    private storage: StorageProvider = createLocalStorageProvider(),
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
    // On failure the note stays: the transaction may still have been accepted.
    const txHash = await this.client.deposit(note.commitment);
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

    const leaves = await this.client.getLeaves();
    const index = leaves.indexOf(note.commitment);
    if (index === -1) throw new Error('The deposit is not confirmed on-chain yet');

    const merkleProof = await buildMerkleProof(leaves, index);
    const { proof } = await this.prover.proveWithdrawal({
      secret: note.secret,
      merkleProof,
      recipient: recipientField(recipient),
    });
    const txHash = await this.client.withdraw(proof, merkleProof.root, note.nullifier, recipient);
    note.status = 'spending';
    this.record('withdrawal', note, txHash, recipient);
    await this.save();
    return { txHash };
  }

  /** Reconciles notes and pending transactions with the network. */
  async refresh(): Promise<void> {
    const before = JSON.stringify([this.notes, this.transactions]);
    for (const tx of this.transactions.filter((t) => t.status === 'pending')) {
      const status = await this.client.getTransactionStatus(tx.txHash);
      if (status === 'SUCCESS') tx.status = 'confirmed';
      else if (status === 'FAILED') tx.status = 'failed';
    }
    const open = this.getNotes().filter((n) => n.status !== 'spent');
    const leaves = open.some((n) => n.status === 'unconfirmed')
      ? new Set(await this.client.getLeaves())
      : new Set<string>();
    for (const note of open) {
      if (note.status === 'unconfirmed' && leaves.has(note.commitment)) note.status = 'available';
      if (note.status !== 'unconfirmed' && (await this.client.isNullifierSpent(note.nullifier))) {
        note.status = 'spent';
      } else if (note.status === 'spending') {
        const last = this.transactions.filter(
          (t) => t.type === 'withdrawal' && t.nullifier === note.nullifier,
        ).at(-1);
        if (last?.status === 'failed') note.status = 'available';
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
