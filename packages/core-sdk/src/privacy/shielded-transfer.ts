import { StellarClient } from '../stellar/client';
import { ProofGenerator } from './proof-generator';
import {
  ShieldedTransferParams,
  ShieldedTransferResult,
  Commitment,
  ShieldedTransaction,
} from '../types';
import { generateRandomField, generateMerklePath } from '../utils/crypto';
import { createLocalStorageProvider } from '../utils/storage';
import { isValidPublicKey, isValidAmount } from '../utils/encoding';
import type { StorageProvider } from '../types';
import { logger } from '../utils/logger';

const TX_CACHE_KEY = 'tx_history';
const COMMITMENT_CACHE_KEY = 'commitments';

type EventHandler = (...args: unknown[]) => void;

export interface ShieldedTransferOptions {
  /**
   * Substitute a `simulated_…` hash when a transaction cannot be submitted.
   * For demos and tests only: nothing reaches the network.
   */
  simulateOnFailure?: boolean;
}

export class ShieldedTransfer {
  private client: StellarClient;
  private proofGenerator: ProofGenerator;
  private commitments: Map<string, Commitment> = new Map();
  private transactions: ShieldedTransaction[] = [];
  private listeners: Map<string, Set<EventHandler>> = new Map();
  private storage: StorageProvider;

  constructor(
    client: StellarClient,
    storage?: StorageProvider,
    proofGenerator?: ProofGenerator,
    private options: ShieldedTransferOptions = {},
  ) {
    this.client = client;
    this.proofGenerator = proofGenerator ?? new ProofGenerator();
    this.storage = storage ?? createLocalStorageProvider();
  }

  async loadPersistedState(): Promise<void> {
    try {
      const txJson = await this.storage.get(TX_CACHE_KEY);
      if (txJson) this.transactions = JSON.parse(txJson);

      const cmJson = await this.storage.get(COMMITMENT_CACHE_KEY);
      if (cmJson) {
        const entries: [string, Commitment][] = JSON.parse(cmJson);
        this.commitments = new Map(entries);
      }
    } catch (error) {
      // Corrupt persisted state should never break the SDK.
      logger.warn('Failed to load persisted shielded-transfer state', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async persistState(): Promise<void> {
    try {
      await this.storage.set(TX_CACHE_KEY, JSON.stringify(this.transactions));
      await this.storage.set(COMMITMENT_CACHE_KEY, JSON.stringify([...this.commitments]));
    } catch (error) {
      // Persistence is best-effort; the SDK continues in-memory.
      logger.warn('Failed to persist shielded-transfer state', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  on(event: string, handler: EventHandler): void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(handler);
  }

  off(event: string, handler: EventHandler): void {
    this.listeners.get(event)?.delete(handler);
  }

  private emit(event: string, ...args: unknown[]): void {
    this.listeners.get(event)?.forEach((h) => h(...args));
  }

  async initialize(): Promise<void> {
    await this.proofGenerator.initialize();
    await this.loadPersistedState();
  }

  private validateDepositParams(params: ShieldedTransferParams): void {
    if (!params || typeof params !== 'object') {
      throw new Error('Deposit parameters are required');
    }
    if (!isValidAmount(params.amount)) {
      throw new Error('Invalid amount: must be a positive number');
    }
    if (!isValidPublicKey(params.recipient)) {
      throw new Error('Invalid recipient: must be a valid Stellar public key (G...)');
    }
    if (!params.token || typeof params.token !== 'string' || params.token.length > 64) {
      throw new Error('Invalid token: must be a non-empty string (max 64 chars)');
    }
  }

  async deposit(params: ShieldedTransferParams): Promise<ShieldedTransferResult> {
    this.validateDepositParams(params);
    this.emit('onTransferInitiated', params);

    try {
      // One secret drives BOTH the on-chain commitment and the ZK proof so the
      // proven commitment matches the one actually committed on-chain.
      const senderSecret = await generateRandomField();
      const { proof, publicInputs, commitment: commitmentHash, nullifier } =
        await this.proofGenerator.generateShieldedTransferProof(params, senderSecret);

      const isValid = await this.proofGenerator.verifyProof(proof, publicInputs);
      if (!isValid) {
        throw new Error('Proof verification failed locally');
      }

      let txHash: string;
      try {
        txHash = await this.client.depositCommitment(
          commitmentHash,
          params.amount,
          params.token,
        );
      } catch (error) {
        if (!this.options.simulateOnFailure) throw error;
        txHash = 'simulated_' + commitmentHash.slice(2, 18);
        logger.warn('Deposit transaction failed — simulated tx hash used', {
          error: error instanceof Error ? error.message : String(error),
        });
      }

      const commitment: Commitment = {
        hash: commitmentHash,
        nullifier,
        amount: params.amount,
        token: params.token,
        recipient: params.recipient,
        timestamp: Date.now(),
      };

      this.commitments.set(commitmentHash, commitment);

      const tx: ShieldedTransaction = {
        txHash,
        commitmentHash,
        nullifier,
        amount: params.amount,
        token: params.token,
        recipient: params.recipient,
        timestamp: Date.now(),
        status: 'pending',
      };

      this.transactions.push(tx);
      await this.persistState();

      const result: ShieldedTransferResult = {
        txHash,
        commitmentHash,
        nullifier,
        status: 'pending',
      };

      this.emit('onTransferCompleted', result);
      return result;
    } catch (error) {
      const err = error instanceof Error ? error : new Error('Shielded deposit failed');
      this.emit('onTransferFailed', err);
      logger.error('Shielded deposit failed', {
        amount: params.amount,
        token: params.token,
        error: err.message,
      });
      throw err;
    }
  }

  async withdraw(
    commitmentHash: string,
    recipient: string,
    amount: string,
  ): Promise<ShieldedTransferResult> {
    const commitment = this.commitments.get(commitmentHash);
    if (!commitment) {
      throw new Error('Commitment not found. Deposit must be made first.');
    }
    if (!isValidPublicKey(recipient)) {
      throw new Error('Invalid recipient: must be a valid Stellar public key (G...)');
    }
    if (!isValidAmount(amount)) {
      throw new Error('Invalid amount: must be a positive number');
    }
    // No change commitments yet: a withdrawal spends the whole commitment.
    if (amount !== commitment.amount) {
      throw new Error(`Invalid amount: must equal the deposited amount (${commitment.amount})`);
    }

    // The nullifier is fixed at deposit time. Deriving it from the recipient
    // would let one commitment be spent once per recipient.
    const nullifier =
      commitment.nullifier ??
      this.transactions.find((tx) => tx.commitmentHash === commitmentHash)?.nullifier;
    if (!nullifier) {
      throw new Error('Commitment has no nullifier and cannot be withdrawn');
    }

    // Build a real Merkle membership proof for this commitment from the set of
    // known commitments (previously this was always an empty array, making the
    // withdrawal proof unsound — issue #1).
    const leaves = Array.from(this.commitments.keys());
    const leafIndex = leaves.indexOf(commitmentHash);
    if (leafIndex === -1) {
      throw new Error('Commitment not found in Merkle tree');
    }
    const merkleProof = await generateMerklePath(leaves, leafIndex);

    const withdrawalProof = await this.proofGenerator.generateWithdrawalProof(
      commitmentHash,
      nullifier,
      merkleProof,
      recipient,
      amount,
    );

    // Must mirror the inputs the prover folded into the proof
    // (SimulatedProver hashes [commitment, nullifier, ...merkleProof, recipient, amount]).
    // Note: the merkle root implied by this path is not independently checked
    // against a canonical on-chain root — a protocol concern for production.
    const publicInputs = [commitmentHash, nullifier, ...merkleProof, recipient, amount];
    const isValid = await this.proofGenerator.verifyProof(withdrawalProof, publicInputs);
    if (!isValid) {
      throw new Error('Withdrawal proof verification failed');
    }

    let txHash: string;
    try {
      txHash = await this.client.withdrawCommitment(
        nullifier,
        merkleProof,
        recipient,
        JSON.stringify(withdrawalProof),
      );
    } catch (error) {
      if (!this.options.simulateOnFailure) throw error;
      txHash = 'simulated_withdraw_' + commitmentHash.slice(2, 18);
      logger.warn('Withdraw transaction failed — simulated tx hash used', {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    this.commitments.delete(commitmentHash);
    await this.persistState();

    const result: ShieldedTransferResult = {
      txHash,
      commitmentHash,
      nullifier,
      status: 'pending',
    };

    this.emit('onTransferCompleted', result);
    return result;
  }

  async getTransactionHistory(): Promise<ShieldedTransaction[]> {
    return [...this.transactions].sort((a, b) => b.timestamp - a.timestamp);
  }

  async getCommitment(commitmentHash: string): Promise<Commitment | undefined> {
    return this.commitments.get(commitmentHash);
  }

  async getBalance(): Promise<string> {
    const wallet = this.client.getWalletInfo();
    if (!wallet) return '0';
    try {
      return await this.client.getAccountBalance(wallet.publicKey);
    } catch {
      return '0';
    }
  }

  async refreshTransactionStatus(txHash: string): Promise<string> {
    try {
      return await this.client.getTransactionStatus(txHash);
    } catch {
      return 'not_found';
    }
  }

  setContractId(contractId: string): void {
    this.client.setContractId(contractId);
  }
}
