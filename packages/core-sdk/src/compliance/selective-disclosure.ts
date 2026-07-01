import { EventEmitter } from 'events';
import {
  ShieldedTransaction,
  DisclosurePayload,
  ComplianceDisclosureRequest,
} from '../types';
import { ProofGenerator } from '../privacy/proof-generator';
import { ViewingKeyManager } from './viewing-keys';
import { poseidonHash, sha256, generateRandomField } from '../utils/crypto';
import { StellarClient } from '../stellar/client';

export class SelectiveDisclosure extends EventEmitter {
  private proofGenerator: ProofGenerator;
  private viewingKeyManager: ViewingKeyManager;
  private client: StellarClient;
  private disclosureRequests: Map<string, ComplianceDisclosureRequest> = new Map();
  private disclosurePayloads: Map<string, DisclosurePayload> = new Map();

  constructor(
    client: StellarClient,
    viewingKeyManager: ViewingKeyManager,
    proofGenerator: ProofGenerator,
  ) {
    super();
    this.client = client;
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
        tx.amount,
        tx.recipient,
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

      const keyId = this.findViewingKeyForRegulator(request.regulatorPublicKey);
      if (keyId) {
        const signedPayload = await this.viewingKeyManager.signDisclosurePayload(
          payload,
          keyId,
        );
        payloads.push(signedPayload);
      } else {
        payloads.push(payload);
      }

      const payloadId = await poseidonHash([tx.txHash, requestId]);
      this.disclosurePayloads.set(payloadId, payload);
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

  async discloseToRegulator(
    transactions: ShieldedTransaction[],
    regulatorPublicKey: string,
    scope: ComplianceDisclosureRequest['scope'] = 'full',
  ): Promise<string> {
    const disclosureHash = await poseidonHash([
      regulatorPublicKey,
      JSON.stringify(transactions.map((t) => t.txHash)),
      scope,
      Date.now().toString(),
    ]);

    for (const tx of transactions) {
      const disclosureProof = await this.proofGenerator.generateDisclosureProof(
        tx.commitmentHash,
        tx.amount,
        tx.recipient,
        regulatorPublicKey,
      );

      const payload = {
        transactionHash: tx.txHash,
        commitmentHash: tx.commitmentHash,
        amount: scope === 'amount-only' || scope === 'full' ? tx.amount : undefined,
        recipient: scope === 'recipient-only' || scope === 'full' ? tx.recipient : undefined,
        proof: disclosureProof,
        scope,
        timestamp: Date.now(),
        regulatorSignature: await sha256(disclosureHash),
      };

      const payloadId = await poseidonHash([tx.txHash, regulatorPublicKey]);
      this.disclosurePayloads.set(payloadId, payload as DisclosurePayload);

      await this.client.discloseTransaction(
        tx.txHash,
        JSON.stringify(payload),
      );
    }

    return disclosureHash;
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
