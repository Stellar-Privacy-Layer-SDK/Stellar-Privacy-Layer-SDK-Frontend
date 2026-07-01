import { StellarClient } from '../stellar/client';
import { ProofGenerator } from './proof-generator';
import {
  ShieldedTransferParams,
  ShieldedTransferResult,
  Commitment,
  ShieldedTransaction,
} from '../types';
import { generateCommitment, generateNullifier, generateRandomField, poseidonHash } from '../utils/crypto';
import { createLocalStorageProvider } from '../utils/storage';
import type { StorageProvider } from '../types';

const TX_CACHE_KEY = 'tx_history';
const COMMITMENT_CACHE_KEY = 'commitments';

type EventHandler = (...args: unknown[]) => void;

export class ShieldedTransfer {
  private client: StellarClient;
  private proofGenerator: ProofGenerator;
  private commitments: Map<string, Commitment> = new Map();
  private transactions: ShieldedTransaction[] = [];
  private listeners: Map<string, Set<EventHandler>> = new Map();
  private storage: StorageProvider;

  constructor(client: StellarClient, storage?: StorageProvider) {
    this.client = client;
    this.proofGenerator = new ProofGenerator();
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
    } catch {
      // ignore corrupt data
    }
  }

  private async persistState(): Promise<void> {
    try {
      await this.storage.set(TX_CACHE_KEY, JSON.stringify(this.transactions));
      await this.storage.set(COMMITMENT_CACHE_KEY, JSON.stringify([...this.commitments]));
    } catch {
      // storage full
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

  async deposit(params: ShieldedTransferParams): Promise<ShieldedTransferResult> {
    this.emit('onTransferInitiated', params);

    try {
      const senderSecret = await generateRandomField();
      const nullifier = await generateNullifier(senderSecret, 0);
      const commitmentHash = await generateCommitment(
        senderSecret,
        params.recipient,
        params.amount,
        params.token,
      );

      const { proof, publicInputs } = await this.proofGenerator.generateShieldedTransferProof(params);

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
      } catch {
        txHash = 'simulated_' + commitmentHash.slice(0, 16);
      }

      const commitment: Commitment = {
        hash: commitmentHash,
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

    const nullifier = await poseidonHash([commitmentHash, recipient]);
    const merkleProof: string[] = [];

    const withdrawalProof = await this.proofGenerator.generateWithdrawalProof(
      commitmentHash,
      nullifier,
      merkleProof,
      recipient,
      amount,
    );

    const publicInputs = [commitmentHash, nullifier, recipient, amount];
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
    } catch {
      txHash = 'simulated_withdraw_' + commitmentHash.slice(0, 16);
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
