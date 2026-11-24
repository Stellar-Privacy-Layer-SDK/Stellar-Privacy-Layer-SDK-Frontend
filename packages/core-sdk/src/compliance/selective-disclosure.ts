import { poseidonHash } from '../utils/crypto.js';
import type {
  ComplianceDisclosureRequest,
  DisclosurePayload,
  ShieldedTransaction,
} from '../types.js';
import type { ViewingKeyManager } from './viewing-keys.js';

/**
 * Builds scoped, signed statements about transactions for a regulator.
 *
 * Payloads are attestations by the viewing key holder, not zero-knowledge
 * proofs. They hold plaintext and are never published; deliver them privately.
 */
export class SelectiveDisclosure {
  private payloads = new Map<string, DisclosurePayload>();

  constructor(private viewingKeys: ViewingKeyManager) {}

  /** Creates one signed payload per transaction. Grants a viewing key if needed. */
  async disclose(
    transactions: ShieldedTransaction[],
    regulatorPublicKey: string,
    scope: ComplianceDisclosureRequest['scope'] = 'full',
  ): Promise<{ reference: string; payloads: DisclosurePayload[] }> {
    const existing = this.viewingKeys
      .getActiveViewingKeys()
      .find(
        (k) =>
          k.grantedBy === regulatorPublicKey && k.scope === scope && this.viewingKeys.getPrivateKey(k.id),
      );
    const key = existing ?? (await this.viewingKeys.grantViewingKey(regulatorPublicKey, scope));

    const payloads = await Promise.all(
      transactions.map((tx) =>
        this.viewingKeys.signDisclosurePayload(
          {
            transactionHash: tx.txHash,
            commitmentHash: tx.commitmentHash,
            amount: scope === 'recipient-only' ? undefined : tx.amount,
            recipient: scope === 'amount-only' ? undefined : tx.recipient,
            scope,
            timestamp: Date.now(),
          },
          key.id,
        ),
      ),
    );
    payloads.forEach((p) => this.payloads.set(p.transactionHash, p));
    const reference = await poseidonHash([
      regulatorPublicKey,
      ...payloads.map((p) => p.regulatorSignature ?? ''),
    ]);
    return { reference, payloads };
  }

  /** Checks the signature and that it was made by the expected signer. */
  async verify(payload: DisclosurePayload, expectedSigner: string): Promise<boolean> {
    return (
      payload.signerPublicKey === expectedSigner &&
      this.viewingKeys.verifyDisclosurePayload(payload)
    );
  }

  getPayload(txHash: string): DisclosurePayload | undefined {
    return this.payloads.get(txHash);
  }
}
