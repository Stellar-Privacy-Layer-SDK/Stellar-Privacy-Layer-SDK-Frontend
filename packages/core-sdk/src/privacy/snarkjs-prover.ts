import { sha256 } from '../utils/crypto';
import type { Prover, ProverArtifacts } from './prover';
import type { ZKProof, ShieldedTransferParams } from '../types';

type SnarkJSGroth16Proof = {
  pi_a: [string, string];
  pi_b: [[string, string], [string, string]];
  pi_c: [string, string];
  protocol: string;
  curve: string;
}

export class SnarkjsProver implements Prover {
  private initialized = false;
  private artifacts: ProverArtifacts | null = null;
  private groth16: typeof import('snarkjs').groth16 | null = null;

  constructor(artifacts?: ProverArtifacts) {
    if (artifacts) this.artifacts = artifacts;
  }

  setArtifacts(artifacts: ProverArtifacts): void {
    this.artifacts = artifacts;
  }

  async initialize(): Promise<void> {
    try {
      const snarkjs = await import('snarkjs');
      this.groth16 = snarkjs.groth16;
    } catch {
      // snarkjs not available at runtime
    }
    this.initialized = true;
  }

  isReady(): boolean {
    return this.initialized && this.groth16 !== null && this.artifacts !== null;
  }

  async generateShieldedProof(
    params: ShieldedTransferParams,
    secret: string,
  ): ReturnType<Prover['generateShieldedProof']> {
    if (!this.isReady() || !this.groth16 || !this.artifacts) {
      throw new Error('SnarkjsProver not ready. Call initialize() and setArtifacts() first.');
    }

    const secretHash = await sha256(secret);
    const amountHash = await sha256(params.amount);
    const recipientHash = await sha256(params.recipient);
    const tokenHash = await sha256(params.token);
    const commitmentHash = await sha256(secretHash + recipientHash + amountHash + tokenHash);
    const nullifier = await sha256(secretHash + '0');

    const circuitInputs = {
      senderSecret: BigInt('0x' + secretHash),
      recipient: BigInt('0x' + recipientHash),
      amount: BigInt('0x' + amountHash),
      token: BigInt('0x' + tokenHash),
      commitment: BigInt('0x' + commitmentHash),
      nullifier: BigInt('0x' + nullifier),
    };

    const wasmData = typeof this.artifacts.wasm === 'string'
      ? this.artifacts.wasm
      : this.artifacts.wasm;

    const zkeyData = typeof this.artifacts.zkey === 'string'
      ? this.artifacts.zkey
      : this.artifacts.zkey;

    const { proof, publicSignals } = await this.groth16.fullProve(
      circuitInputs,
      wasmData,
      zkeyData,
    );

    const publicInputs = [
      commitmentHash,
      nullifier,
      publicSignals[2] ?? '0',
      params.recipient,
    ];

    return {
      proof: proof as unknown as ZKProof,
      publicInputs,
      commitment: commitmentHash,
      nullifier,
    };
  }

  async generateWithdrawalProof(
    commitment: string,
    nullifier: string,
    merkleProof: string[],
    recipient: string,
    amount: string,
  ): Promise<ZKProof> {
    if (!this.isReady() || !this.groth16 || !this.artifacts) {
      throw new Error('SnarkjsProver not ready');
    }

    const circuitInputs: Record<string, bigint> = {
      commitment: BigInt('0x' + commitment.replace('0x', '')),
      nullifier: BigInt('0x' + nullifier.replace('0x', '')),
      recipient: BigInt('0x' + (await sha256(recipient))),
      amount: BigInt(amount),
    };
    merkleProof.forEach((p, i) => {
      circuitInputs[`merklePath_${i}`] = BigInt('0x' + p.replace('0x', ''));
    });

    const wasmData = typeof this.artifacts.wasm === 'string'
      ? this.artifacts.wasm
      : this.artifacts.wasm;

    const zkeyData = typeof this.artifacts.zkey === 'string'
      ? this.artifacts.zkey
      : this.artifacts.zkey;

    const { proof } = await this.groth16.fullProve(
      circuitInputs,
      wasmData,
      zkeyData,
    );

    return proof as unknown as ZKProof;
  }

  async generateDisclosureProof(
    _commitment: string,
    _amount: string,
    _recipient: string,
    _viewerPublicKey: string,
  ): Promise<ZKProof> {
    throw new Error(
      'Disclosure proofs require a separate compliance circuit. ' +
      'Use SimulatedProver for development or provide a disclosure circuit artifact.',
    );
  }

  async verifyProof(proof: ZKProof, publicInputs: string[]): Promise<boolean> {
    if (!this.isReady() || !this.groth16 || !this.artifacts) return false;

    try {
      return await this.groth16.verify(
        this.artifacts.vkey,
        publicInputs,
        proof as unknown as SnarkJSGroth16Proof,
      );
    } catch {
      return false;
    }
  }
}
