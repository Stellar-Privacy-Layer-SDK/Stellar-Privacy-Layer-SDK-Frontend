import { generateRandomField } from '../utils/crypto';
import { SimulatedProver } from './simulated-prover';
import type { Prover } from './prover';
import type { ZKProof, ShieldedTransferParams } from '../types';

export class ProofGenerator {
  private prover: Prover;

  constructor(prover?: Prover) {
    this.prover = prover ?? new SimulatedProver();
  }

  async initialize(): Promise<void> {
    await this.prover.initialize();
  }

  isReady(): boolean {
    return this.prover.isReady();
  }

  async generateShieldedTransferProof(
    params: ShieldedTransferParams,
    secret?: string,
  ): Promise<{
    proof: ZKProof;
    publicInputs: string[];
    commitment: string;
    nullifier: string;
  }> {
    const senderSecret = secret ?? (await generateRandomField());
    return this.prover.generateShieldedProof(params, senderSecret);
  }

  async verifyProof(proof: ZKProof, publicInputs: string[]): Promise<boolean> {
    return this.prover.verifyProof(proof, publicInputs);
  }

  async generateWithdrawalProof(
    commitment: string,
    nullifier: string,
    merkleProof: string[],
    recipient: string,
    amount: string,
  ): Promise<ZKProof> {
    return this.prover.generateWithdrawalProof(commitment, nullifier, merkleProof, recipient, amount);
  }

  async generateDisclosureProof(
    commitment: string,
    amount: string,
    recipient: string,
    viewerPublicKey: string,
  ): Promise<ZKProof> {
    return this.prover.generateDisclosureProof(commitment, amount, recipient, viewerPublicKey);
  }
}
