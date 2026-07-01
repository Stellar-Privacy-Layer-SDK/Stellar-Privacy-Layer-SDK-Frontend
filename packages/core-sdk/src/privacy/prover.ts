import type { ZKProof, ShieldedTransferParams } from '../types';

export interface ProverArtifacts {
  wasm: Uint8Array | string;
  zkey: Uint8Array | string;
  vkey: Uint8Array | string;
}

export interface Prover {
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

export { SnarkjsProver } from './snarkjs-prover';
export { SimulatedProver } from './simulated-prover';
