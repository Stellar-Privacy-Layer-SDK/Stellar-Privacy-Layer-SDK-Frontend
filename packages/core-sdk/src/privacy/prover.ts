import type { ZKProof, ShieldedTransferParams } from '../types';

export interface ProverArtifacts {
  wasm: Uint8Array | string;
  zkey: Uint8Array | string;
  /** Verification key: URL to a vkey JSON, raw parsed JSON object, or binary. */
  vkey: Uint8Array | string | Record<string, unknown>;
}

export interface Prover {
  /** True for provers whose proofs carry no security. Refused on mainnet. */
  readonly simulated?: boolean;
  initialize(): Promise<void>;
  isReady(): boolean;
  generateShieldedProof(params: ShieldedTransferParams, secret: string): Promise<{
    proof: ZKProof;
    publicInputs: string[];
    commitment: string;
    nullifier: string;
  }>;
  generateWithdrawalProof(
    commitment: string,
    nullifier: string,
    merkleProof: string[],
    recipient: string,
    amount: string,
  ): Promise<ZKProof>;
  generateDisclosureProof(
    commitment: string,
    amount: string,
    recipient: string,
    viewerPublicKey: string,
  ): Promise<ZKProof>;
  verifyProof(proof: ZKProof, publicInputs: string[]): Promise<boolean>;
}
