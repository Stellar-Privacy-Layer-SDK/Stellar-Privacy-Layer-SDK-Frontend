import { StellarClient } from './stellar/client';
import { WalletManager } from './stellar/wallet';
import { ShieldedTransfer } from './privacy/shielded-transfer';
import { ProofGenerator } from './privacy/proof-generator';
import { ProofVerifier } from './privacy/verifier';
import { ViewingKeyManager } from './compliance/viewing-keys';
import { SelectiveDisclosure } from './compliance/selective-disclosure';

export { StellarClient } from './stellar/client';
export { WalletManager } from './stellar/wallet';
export { NETWORK_CONFIGS, PRIVACY_CONTRACT_METHODS } from './stellar/config';
export { ShieldedTransfer } from './privacy/shielded-transfer';
export { ProofGenerator } from './privacy/proof-generator';
export { ProofVerifier } from './privacy/verifier';
export { ViewingKeyManager } from './compliance/viewing-keys';
export { SelectiveDisclosure } from './compliance/selective-disclosure';
export * from './types';
export * from './utils/crypto';
export * from './utils/encoding';
export * from './utils/storage';

export class PrivacySDK {
  public client: StellarClient;
  public wallet: WalletManager;
  public shieldedTransfer: ShieldedTransfer;
  public proofGenerator: ProofGenerator;
  public proofVerifier: ProofVerifier;
  public viewingKeys: ViewingKeyManager;
  public selectiveDisclosure: SelectiveDisclosure;

  constructor(config?: { storageProvider?: import('./types').StorageProvider }) {
    const sp = config?.storageProvider;
    this.client = new StellarClient({ storageProvider: sp });
    this.wallet = new WalletManager();
    this.shieldedTransfer = new ShieldedTransfer(this.client);
    this.proofGenerator = new ProofGenerator();
    this.proofVerifier = new ProofVerifier(this.client);
    this.viewingKeys = new ViewingKeyManager(sp);
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

export { createLocalStorageProvider, createMemoryStorageProvider } from './utils/storage';
