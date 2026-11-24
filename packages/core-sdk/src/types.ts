export enum Network {
  PUBLIC = 'public',
  TESTNET = 'testnet',
  FUTURENET = 'futurenet',
  SANDBOX = 'sandbox',
}

export interface NetworkConfig {
  network: Network;
  rpcUrl: string;
  networkPassphrase: string;
  contractId: string;
  horizonUrl: string;
}

export interface WalletInfo {
  publicKey: string;
  network: Network;
  isConnected: boolean;
}

export interface ShieldedTransferParams {
  amount: string;
  token: string;
  recipient: string;
  memo?: string;
}

export interface ShieldedTransferResult {
  txHash: string;
  commitmentHash: string;
  nullifier: string;
  blockNumber?: number;
  status: 'pending' | 'confirmed' | 'failed';
}

export interface ProofInput {
  senderSecret: string;
  recipientPublicKey: string;
  amount: string;
  token: string;
  merkleRoot: string;
  merklePath: string[];
  nullifier: string;
  commitment: string;
}

export interface ZKProof {
  pi_a: [string, string];
  pi_b: [[string, string], [string, string]];
  pi_c: [string, string];
  protocol: string;
  curve: string;
}

export interface Commitment {
  hash: string;
  nullifier: string;
  amount: string;
  token: string;
  recipient: string;
  timestamp: number;
  blockNumber?: number;
}

export interface ViewingKey {
  id: string;
  label: string;
  publicKey: string;
  encryptedPrivateKey: string;
  createdAt: number;
  expiresAt?: number;
  grantedBy: string;
  scope: 'full' | 'amount-only' | 'recipient-only';
  active: boolean;
}

export interface ComplianceDisclosureRequest {
  regulatorPublicKey: string;
  scope: 'full' | 'amount-only' | 'recipient-only';
  expiresAt?: number;
  reason: string;
}

export interface DisclosurePayload {
  transactionHash: string;
  commitmentHash: string;
  amount?: string;
  recipient?: string;
  sender?: string;
  proof: ZKProof;
  scope: string;
  timestamp: number;
  signerPublicKey?: string;
  regulatorSignature?: string;
}

export interface ShieldedTransaction {
  /** Absent on records saved before withdrawals were tracked (all deposits). */
  type?: 'deposit' | 'withdrawal';
  txHash: string;
  commitmentHash: string;
  nullifier: string;
  amount: string;
  token: string;
  recipient: string;
  timestamp: number;
  status: 'pending' | 'confirmed' | 'failed';
  blockNumber?: number;
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface SDKConfig {
  network: NetworkConfig;
  wallet?: WalletInfo;
  storageProvider?: StorageProvider;
}

export interface StorageProvider {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}
