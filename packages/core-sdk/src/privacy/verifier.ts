import { ZKProof } from '../types';
import { ProofGenerator } from './proof-generator';
import { StellarClient } from '../stellar/client';

export class ProofVerifier {
  constructor(
    private client: StellarClient,
    private proofGenerator: ProofGenerator,
  ) {}

  /** Verifies locally with the configured prover. */
  async verifyProof(proof: ZKProof, publicInputs: string[]): Promise<boolean> {
    if (!this.verifyProofStructure(proof)) return false;
    return this.proofGenerator.verifyProof(proof, publicInputs);
  }

  /** Verifies with the contract's pairing check; throws if it is unreachable. */
  async verifyProofOnChain(proof: ZKProof, publicInputs: string[]): Promise<boolean> {
    return this.client.verifyProof(proof, publicInputs);
  }

  verifyProofStructure(proof: unknown): proof is ZKProof {
    if (!proof || typeof proof !== 'object') return false;
    const p = proof as Record<string, unknown>;
    return (
      Array.isArray(p.pi_a) && p.pi_a.length === 2 &&
      Array.isArray(p.pi_b) && p.pi_b.length === 2 &&
      Array.isArray(p.pi_b[0]) && (p.pi_b[0] as unknown[]).length === 2 &&
      Array.isArray(p.pi_b[1]) && (p.pi_b[1] as unknown[]).length === 2 &&
      Array.isArray(p.pi_c) && p.pi_c.length === 2 &&
      typeof p.protocol === 'string' && typeof p.curve === 'string'
    );
  }
}
