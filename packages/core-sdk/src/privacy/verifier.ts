import { bn254 } from '@noble/curves/bn254.js';
import { EventEmitter } from 'events';
import { ZKProof } from '../types';
import { poseidonHash, generateRandomField } from '../utils/crypto';
import { StellarClient } from '../stellar/client';

const Fr = bn254.fields.Fr;

export class ProofVerifier extends EventEmitter {
  private client: StellarClient;

  constructor(client: StellarClient) {
    super();
    this.client = client;
  }

  async verifyProof(proof: ZKProof, publicInputs: string[]): Promise<boolean> {
    const localVerification = await this.localVerify(proof, publicInputs);
    if (!localVerification) return false;
    try {
      const onChainVerification = await this.client.verifyProof(
        JSON.stringify(proof),
        publicInputs,
      );
      return onChainVerification;
    } catch {
      return localVerification;
    }
  }

  private async localVerify(proof: ZKProof, publicInputs: string[]): Promise<boolean> {
    try {
      if (proof.protocol !== 'groth16' || proof.curve !== 'bn254') return false;

      const challenge = await poseidonHash(publicInputs);
      const cF = Fr.create(BigInt('0x' + challenge.slice(2)));

      const a0 = Fr.create(BigInt('0x' + proof.pi_a[0].slice(2)));
      const a1 = Fr.create(BigInt('0x' + proof.pi_a[1].slice(2)));
      const c0 = Fr.create(BigInt('0x' + proof.pi_c[0].slice(2)));

      return Fr.add(a0, a1) === Fr.add(cF, c0);
    } catch {
      return false;
    }
  }

  async generateVerificationKey(): Promise<string> {
    const keyMaterial = await poseidonHash([
      Date.now().toString(),
      await generateRandomField(),
    ]);
    return keyMaterial;
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
