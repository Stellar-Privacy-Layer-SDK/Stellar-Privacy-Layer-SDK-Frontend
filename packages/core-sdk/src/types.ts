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

export interface ZKProof {
  pi_a: [string, string];
  pi_b: [[string, string], [string, string]];
  pi_c: [string, string];
  protocol: string;
  curve: string;
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
  scope: string;
  timestamp: number;
  signerPublicKey?: string;
  regulatorSignature?: string;
}

export interface ShieldedTransaction {
  type: 'deposit' | 'withdrawal';
  txHash: string;
  commitmentHash: string;
  nullifier: string;
  /** Whole token units. */
  amount: string;
  token: string;
  /** Only known for withdrawals. */
  recipient?: string;
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

export interface PoolInfo {
  token: string;
  /** Amount of every deposit, in the token's smallest unit. */
  denomination: string;
  depositCount: number;
  root: string;
}
