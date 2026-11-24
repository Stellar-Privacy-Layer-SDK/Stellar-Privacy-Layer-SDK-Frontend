import { StellarClient, type TransactionSigner } from './stellar/client.js';
import { WalletManager } from './stellar/wallet.js';
import { ShieldedPool } from './privacy/shielded-pool.js';
import { ViewingKeyManager } from './compliance/viewing-keys.js';
import { SelectiveDisclosure } from './compliance/selective-disclosure.js';
import { setLogLevel } from './utils/logger.js';
import type { Relayer } from './privacy/relayer.js';
import type { Prover } from './privacy/prover.js';
import type { NetworkConfig, StorageProvider, LogLevel } from './types.js';

export { StellarClient, NotSubmittedError, type TransactionSigner } from './stellar/client.js';
export { WalletManager } from './stellar/wallet.js';
export {
  NETWORK_CONFIGS,
  resolveNetworkConfig,
  type NetworkOverrides,
} from './stellar/config.js';
export { ShieldedPool } from './privacy/shielded-pool.js';
export { encodeNote, decodeNote, deriveNote, type Note, type NoteStatus } from './privacy/note.js';
export { payoutField, encodeGroth16Proof } from './stellar/abi.js';
export { ViewingKeyManager } from './compliance/viewing-keys.js';
export { SelectiveDisclosure } from './compliance/selective-disclosure.js';
export type { Prover, ProverArtifacts, WithdrawalStatement } from './privacy/prover.js';
export {
  HttpRelayer,
  parseWithdrawalRequest,
  type Relayer,
  type RelayerInfo,
  type WithdrawalRequest,
} from './privacy/relayer.js';
export { SnarkjsProver } from './privacy/snarkjs-prover.js';
export {
  resolveArtifacts,
  resolveArtifactUrls,
  isArtifactUrl,
  fetchArtifact,
  fetchVkeyJson,
  type CircuitArtifactUrls,
} from './privacy/artifacts.js';
export * from './types.js';
export * from './utils/crypto.js';
export * from './utils/encoding.js';
export * from './utils/merkle.js';
export * from './utils/storage.js';
export * from './utils/encrypted-storage.js';

export interface PrivacySDKOptions {
  /** Override the default (testnet) network configuration. */
  network?: NetworkConfig;
  /** Storage backend for persisted SDK state. */
  storageProvider?: StorageProvider;
  /** Minimum log level for the built-in structured logger. */
  logLevel?: LogLevel;
  /** Prover for withdrawals. Deposits work without one. */
  prover?: Prover;
  /** Submits withdrawals so the connected account is not revealed. */
  relayer?: Relayer;
  /** Signs transactions. Defaults to the Freighter wallet. */
  signer?: TransactionSigner;
}

/**
 * Facade that wires together the Stellar client, wallet manager, privacy
 * primitives and compliance tooling into a single entry point.
 */
export class PrivacySDK {
  public client: StellarClient;
  public wallet: WalletManager;
  public pool: ShieldedPool;
  public viewingKeys: ViewingKeyManager;
  public selectiveDisclosure: SelectiveDisclosure;

  constructor(options: PrivacySDKOptions = {}) {
    const { network, storageProvider, logLevel, prover, signer, relayer } = options;

    if (logLevel) setLogLevel(logLevel);

    this.client = new StellarClient({ network, storageProvider, signer });
    this.wallet = new WalletManager({ network, storageProvider });
    this.pool = new ShieldedPool(this.client, prover, storageProvider, relayer);
    this.viewingKeys = new ViewingKeyManager(storageProvider);
    this.selectiveDisclosure = new SelectiveDisclosure(this.viewingKeys);
  }

  async initialize(): Promise<void> {
    await this.pool.initialize();
    await this.viewingKeys.loadPersistedState();
  }
}

export default PrivacySDK;
