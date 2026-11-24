import { StellarClient } from './stellar/client';
import { WalletManager } from './stellar/wallet';
import { ShieldedTransfer } from './privacy/shielded-transfer';
import { ProofGenerator } from './privacy/proof-generator';
import { ProofVerifier } from './privacy/verifier';
import { ViewingKeyManager } from './compliance/viewing-keys';
import { SelectiveDisclosure } from './compliance/selective-disclosure';
import { setLogLevel } from './utils/logger';
import type { Prover } from './privacy/prover';
import type { NetworkConfig, StorageProvider, LogLevel } from './types';

export { StellarClient } from './stellar/client';
export { WalletManager } from './stellar/wallet';
export {
  NETWORK_CONFIGS,
  PRIVACY_CONTRACT_METHODS,
  resolveNetworkConfig,
  type NetworkOverrides,
} from './stellar/config';
export { ShieldedTransfer, type ShieldedTransferOptions } from './privacy/shielded-transfer';
export { ProofGenerator } from './privacy/proof-generator';
export { ProofVerifier } from './privacy/verifier';
export { ViewingKeyManager } from './compliance/viewing-keys';
export { SelectiveDisclosure } from './compliance/selective-disclosure';
export type { Prover, ProverArtifacts } from './privacy/prover';
export { SimulatedProver } from './privacy/simulated-prover';
export { SnarkjsProver, toFieldHex } from './privacy/snarkjs-prover';
export {
  resolveArtifacts,
  resolveArtifactUrls,
  isArtifactUrl,
  fetchArtifact,
  fetchVkeyJson,
  type CircuitArtifactUrls,
} from './privacy/artifacts';
export * from './types';
export * from './utils/crypto';
export * from './utils/encoding';
export * from './utils/storage';
export { createLocalStorageProvider, createMemoryStorageProvider } from './utils/storage';

export interface PrivacySDKOptions {
  /** Override the default (testnet) network configuration. */
  network?: NetworkConfig;
  /** Storage backend for persisted SDK state. */
  storageProvider?: StorageProvider;
  /** Minimum log level for the built-in structured logger. */
  logLevel?: LogLevel;
  /**
   * ZK prover used for proof generation. Defaults to the dev-only
   * `SimulatedProver`; pass a `SnarkjsProver` (with real circuit artifacts)
   * for production-grade proofs.
   */
  prover?: Prover;
  /** Demo mode: fake a transaction hash when submission fails. Defaults to false. */
  simulateOnFailure?: boolean;
}

/**
 * Facade that wires together the Stellar client, wallet manager, privacy
 * primitives and compliance tooling into a single entry point.
 */
export class PrivacySDK {
  public client: StellarClient;
  public wallet: WalletManager;
  public shieldedTransfer: ShieldedTransfer;
  public proofGenerator: ProofGenerator;
  public proofVerifier: ProofVerifier;
  public viewingKeys: ViewingKeyManager;
  public selectiveDisclosure: SelectiveDisclosure;

  constructor(options: PrivacySDKOptions = {}) {
    const { network, storageProvider, logLevel, prover, simulateOnFailure } = options;

    if (logLevel) setLogLevel(logLevel);

    this.client = new StellarClient({ network, storageProvider });
    this.wallet = new WalletManager({ network, storageProvider });
    this.proofGenerator = new ProofGenerator(prover);
    this.shieldedTransfer = new ShieldedTransfer(
      this.client,
      storageProvider,
      this.proofGenerator,
      { simulateOnFailure },
    );
    this.proofVerifier = new ProofVerifier(this.client);
    this.viewingKeys = new ViewingKeyManager(storageProvider);
    this.selectiveDisclosure = new SelectiveDisclosure(
      this.client,
      this.viewingKeys,
      this.proofGenerator,
    );
  }

  async initialize(): Promise<void> {
    await this.shieldedTransfer.initialize();
    await this.proofGenerator.initialize();
    await this.viewingKeys.loadPersistedState();
  }
}

export default PrivacySDK;
