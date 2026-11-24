import { EventEmitter } from 'events';
import { StrKey } from '@stellar/stellar-sdk';
import { ViewingKey, DisclosurePayload } from '../types';
import { generateViewingKeyPair, sealToPublicKey, ed25519PublicKeyToX25519, poseidonHash, signText, verifyText } from '../utils/crypto';
import { isValidPublicKey } from '../utils/encoding';
import { createLocalStorageProvider } from '../utils/storage';
import type { StorageProvider } from '../types';

const KEYS_CACHE_KEY = 'viewing_keys';

export class ViewingKeyManager extends EventEmitter {
  private viewingKeys: Map<string, ViewingKey> = new Map();
  private keyPairs: Map<string, { publicKey: string; privateKey: string }> = new Map();
  private storage: StorageProvider;

  constructor(storage?: StorageProvider) {
    super();
    this.storage = storage ?? createLocalStorageProvider();
  }

  async loadPersistedState(): Promise<void> {
    try {
      const json = await this.storage.get(KEYS_CACHE_KEY);
      if (json) {
        const entries: [string, ViewingKey][] = JSON.parse(json);
        this.viewingKeys = new Map(entries);
      }
    } catch {
      // corrupt persisted data is ignored — keys start empty
    }
  }

  private async persistState(): Promise<void> {
    try {
      await this.storage.set(KEYS_CACHE_KEY, JSON.stringify([...this.viewingKeys]));
    } catch {
      // persistence is best-effort
    }
  }

  async createViewingKey(
    label: string,
    scope: ViewingKey['scope'] = 'full',
    expiresAt?: number,
  ): Promise<ViewingKey> {
    const keyPair = await generateViewingKeyPair();
    const keyId = await poseidonHash([keyPair.publicKey, Date.now().toString()]);

    const viewingKey: ViewingKey = {
      id: keyId,
      label,
      publicKey: keyPair.publicKey,
      encryptedPrivateKey: await sealToPublicKey(keyPair.privateKey, keyPair.publicKey),
      createdAt: Date.now(),
      expiresAt,
      grantedBy: 'self',
      scope,
      active: true,
    };

    this.viewingKeys.set(keyId, viewingKey);
    this.keyPairs.set(keyId, keyPair);
    await this.persistState();

    this.emit('onViewingKeyCreated', viewingKey);
    return viewingKey;
  }

  async grantViewingKey(
    recipientPublicKey: string,
    scope: ViewingKey['scope'] = 'full',
    expiresAt?: number,
  ): Promise<ViewingKey> {
    if (!isValidPublicKey(recipientPublicKey)) {
      throw new Error('Invalid recipient: must be a valid Stellar public key (G...)');
    }
    const keyPair = await generateViewingKeyPair();
    const keyId = await poseidonHash([keyPair.publicKey, Date.now().toString()]);

    const encryptedKey = await sealToPublicKey(
      keyPair.privateKey,
      ed25519PublicKeyToX25519(StrKey.decodeEd25519PublicKey(recipientPublicKey)),
    );

    const viewingKey: ViewingKey = {
      id: keyId,
      label: `Granted to ${recipientPublicKey.slice(0, 8)}`,
      publicKey: keyPair.publicKey,
      encryptedPrivateKey: encryptedKey,
      createdAt: Date.now(),
      expiresAt,
      grantedBy: recipientPublicKey,
      scope,
      active: true,
    };

    this.viewingKeys.set(keyId, viewingKey);
    this.keyPairs.set(keyId, keyPair);
    await this.persistState();

    this.emit('onViewingKeyCreated', viewingKey);
    return viewingKey;
  }

  async revokeViewingKey(keyId: string): Promise<void> {
    const key = this.viewingKeys.get(keyId);
    if (!key) throw new Error('Viewing key not found');

    key.active = false;
    this.viewingKeys.set(keyId, key);
    this.keyPairs.delete(keyId);
    await this.persistState();

    this.emit('onViewingKeyRevoked', keyId);
  }

  getViewingKey(keyId: string): ViewingKey | undefined {
    return this.viewingKeys.get(keyId);
  }

  getActiveViewingKeys(): ViewingKey[] {
    return Array.from(this.viewingKeys.values()).filter((key) => {
      if (!key.active) return false;
      if (key.expiresAt && key.expiresAt < Date.now()) return false;
      return true;
    });
  }

  getAllViewingKeys(): ViewingKey[] {
    return Array.from(this.viewingKeys.values());
  }

  getPrivateKey(keyId: string): string | undefined {
    return this.keyPairs.get(keyId)?.privateKey;
  }

  /**
   * Signs a payload with a viewing key. Verifiers must check that
   * `signerPublicKey` is the Ed25519 key they expect.
   */
  async signDisclosurePayload(payload: DisclosurePayload, keyId: string): Promise<DisclosurePayload> {
    if (!this.viewingKeys.has(keyId)) throw new Error('Viewing key not found');
    const privateKey = this.getPrivateKey(keyId);
    if (!privateKey) throw new Error('Private viewing key is not available in this session');

    const { publicKey, signature } = signText(canonicalPayload(payload), privateKey);
    return { ...payload, signerPublicKey: publicKey, regulatorSignature: signature };
  }

  async verifyDisclosurePayload(payload: DisclosurePayload): Promise<boolean> {
    if (!payload.regulatorSignature || !payload.signerPublicKey) return false;
    return verifyText(canonicalPayload(payload), payload.regulatorSignature, payload.signerPublicKey);
  }
}

/** Every signed field, in a fixed order. */
function canonicalPayload(p: DisclosurePayload): string {
  return JSON.stringify([
    p.transactionHash, p.commitmentHash, p.amount ?? null, p.recipient ?? null,
    p.sender ?? null, p.scope, p.timestamp,
    p.proof.pi_a, p.proof.pi_b, p.proof.pi_c, p.proof.protocol, p.proof.curve,
  ]);
}
