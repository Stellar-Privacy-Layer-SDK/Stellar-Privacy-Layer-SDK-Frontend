import { sha256 } from '../utils/crypto';
import { resolveArtifacts } from './artifacts';
import type { Prover, ProverArtifacts } from './prover';
import type { ZKProof, ShieldedTransferParams } from '../types';
import { logger } from '../utils/logger';

type SnarkJSGroth16Proof = {
  pi_a: [string, string];
  pi_b: [[string, string], [string, string]];
  pi_c: [string, string];
  protocol: string;
  curve: string;
}

/**
 * Production-grade Groth16 prover backed by snarkjs.
 *
 * Artifacts can be supplied in three forms:
 *  - `Uint8Array` binaries (e.g. fetched ahead of time)
 *  - raw strings (Node file paths)
 *  - `https://`/`data:` URLs — fetched automatically during `initialize()`
 *
 * The reference circuit in `circuits/shielded_transfer.circom` exposes its
 * final two public signals as `[commitment, nullifier]`; when present,
 * `generateShieldedProof` extracts them so the on-chain commitment matches the
 * proven one.
 */
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

    if (this.artifacts) {
      try {
        // Resolves any http(s)/data: references into in-memory artifacts.
        this.artifacts = await resolveArtifacts(this.artifacts);
      } catch (error) {
        logger.error('Failed to load ZK circuit artifacts — prover disabled', {
          error: error instanceof Error ? error.message : String(error),
        });
        this.artifacts = null;
      }
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

    const { proof, publicSignals } = await this.groth16.fullProve(
      circuitInputs,
      this.artifacts.wasm,
      this.artifacts.zkey,
    );

    // Groth16 public signals (decimal field strings) ARE the public inputs.
    const publicInputs = publicSignals.length > 0 ? publicSignals : [commitmentHash, nullifier];
    // The reference circuit emits [.., commitment, nullifier] as its final signals.
    const circuitCommitment = toFieldHex(publicSignals[publicSignals.length - 2]) ?? commitmentHash;
    const circuitNullifier = toFieldHex(publicSignals[publicSignals.length - 1]) ?? nullifier;

    return {
      proof: proof as unknown as ZKProof,
      publicInputs,
      commitment: circuitCommitment,
      nullifier: circuitNullifier,
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

    const { proof } = await this.groth16.fullProve(
      circuitInputs,
      this.artifacts.wasm,
      this.artifacts.zkey,
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

/**
 * Converts a Groth16 public signal (decimal field string, e.g. "1234567") into
 * zero-padded hex, or returns `undefined` when the signal is not a plain field
 * element (e.g. it is an artifact hash or non-numeric placeholder).
 */
export function toFieldHex(signal: string | undefined): string | undefined {
  if (!signal) return undefined;
  if (!/^\d+$/.test(signal)) return undefined;
  try {
    const value = BigInt(signal);
    if (value < 0n) return undefined;
    return value.toString(16).padStart(64, '0');
  } catch {
    return undefined;
  }
}
