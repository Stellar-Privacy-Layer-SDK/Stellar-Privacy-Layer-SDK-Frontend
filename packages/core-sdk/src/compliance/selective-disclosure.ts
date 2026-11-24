import { EventEmitter } from 'events';
import {
  ShieldedTransaction,
  DisclosurePayload,
  ComplianceDisclosureRequest,
} from '../types';
import { ProofGenerator } from '../privacy/proof-generator';
import { ViewingKeyManager } from './viewing-keys';
import { poseidonHash, generateRandomField } from '../utils/crypto';

export class SelectiveDisclosure extends EventEmitter {
  private proofGenerator: ProofGenerator;
  private viewingKeyManager: ViewingKeyManager;
  private disclosureRequests: Map<string, ComplianceDisclosureRequest> = new Map();
  private disclosurePayloads: Map<string, DisclosurePayload> = new Map();

  constructor(
    viewingKeyManager: ViewingKeyManager,
    proofGenerator: ProofGenerator,
  ) {
    super();
    this.viewingKeyManager = viewingKeyManager;
    this.proofGenerator = proofGenerator;
  }

  async requestDisclosure(
    request: ComplianceDisclosureRequest,
  ): Promise<string> {
    const requestId = await poseidonHash([
      request.regulatorPublicKey,
      Date.now().toString(),
      await generateRandomField(),
    ]);

    this.disclosureRequests.set(requestId, request);

    return requestId;
  }

  async approveDisclosure(
    requestId: string,
    transactions: ShieldedTransaction[],
  ): Promise<DisclosurePayload[]> {
    const request = this.disclosureRequests.get(requestId);
    if (!request) {
      throw new Error('Disclosure request not found');
    }

    const payloads: DisclosurePayload[] = [];

    for (const tx of transactions) {
      let sanitizedAmount: string | undefined;
      let sanitizedRecipient: string | undefined;

      if (request.scope === 'full' || request.scope === 'amount-only') {
        sanitizedAmount = tx.amount;
      }
      if (request.scope === 'full' || request.scope === 'recipient-only') {
        sanitizedRecipient = tx.recipient;
      }

      const disclosureProof = await this.proofGenerator.generateDisclosureProof(
        tx.commitmentHash,
        sanitizedAmount ?? '',
        sanitizedRecipient ?? '',
        request.regulatorPublicKey,
      );

      const payload: DisclosurePayload = {
        transactionHash: tx.txHash,
        commitmentHash: tx.commitmentHash,
        amount: sanitizedAmount,
        recipient: sanitizedRecipient,
        proof: disclosureProof,
        scope: request.scope,
        timestamp: Date.now(),
      };

      const payloadId = await poseidonHash([tx.txHash, requestId]);
      const keyId = this.findViewingKeyForRegulator(request.regulatorPublicKey);
      if (keyId) {
        const signedPayload = await this.viewingKeyManager.signDisclosurePayload(
          payload,
          keyId,
        );
        payloads.push(signedPayload);
        this.disclosurePayloads.set(payloadId, signedPayload);
      } else {
        payloads.push(payload);
        this.disclosurePayloads.set(payloadId, payload);
      }
    }

    return payloads;
  }

  async requestAuditDisclosure(
    transactions: ShieldedTransaction[],
    regulatorPublicKey: string,
  ): Promise<DisclosurePayload[]> {
    const request: ComplianceDisclosureRequest = {
      regulatorPublicKey,
      scope: 'full',
      reason: 'Compliance audit',
    };

    const requestId = await this.requestDisclosure(request);
    return this.approveDisclosure(requestId, transactions);
  }

  /**
   * Prepares disclosure payloads and returns a reference for them. Payloads
   * hold plaintext, so they are never published on-chain; deliver them
   * privately (see {@link getDisclosurePayload}).
   */
  async discloseToRegulator(
    transactions: ShieldedTransaction[],
    regulatorPublicKey: string,
    scope: ComplianceDisclosureRequest['scope'] = 'full',
  ): Promise<string> {
    const requestId = await this.requestDisclosure({
      regulatorPublicKey,
      scope,
      reason: 'Regulator disclosure',
    });
    await this.approveDisclosure(requestId, transactions);
    return requestId;
  }

  async verifyDisclosure(
    payload: DisclosurePayload,
    regulatorPublicKey: string,
  ): Promise<boolean> {
    const validProof = await this.proofGenerator.verifyProof(payload.proof, [
      payload.commitmentHash,
      payload.amount || '',
      payload.recipient || '',
      regulatorPublicKey,
    ]);

    if (!validProof) return false;

    if (payload.regulatorSignature) {
      return this.viewingKeyManager.verifyDisclosurePayload(payload);
    }

    return true;
  }

  getDisclosurePayload(txHash: string): DisclosurePayload | undefined {
    for (const [, payload] of this.disclosurePayloads) {
      if (payload.transactionHash === txHash) {
        return payload;
      }
    }
    return undefined;
  }

  private findViewingKeyForRegulator(regulatorPublicKey: string): string | undefined {
    const keys = this.viewingKeyManager.getActiveViewingKeys();
    const regulatorKey = keys.find(
      (k) => k.grantedBy === regulatorPublicKey && k.active,
    );
    return regulatorKey?.id;
  }
}
