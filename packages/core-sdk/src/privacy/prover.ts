import type { MerkleProof } from '../utils/merkle.js';
import type { ZKProof } from '../types.js';

export interface ProverArtifacts {
  wasm: Uint8Array | string;
  zkey: Uint8Array | string;
  /** URL of, or parsed, verification key JSON. */
  vkey: string | Record<string, unknown>;
}

export interface WithdrawalStatement {
  secret: string;
  merkleProof: MerkleProof;
  /** The recipient as a field element (see `recipientField`). */
  recipient: string;
}

export interface Prover {
  initialize(): Promise<void>;
  isReady(): boolean;
  /** Proves and locally verifies a withdrawal. */
  proveWithdrawal(statement: WithdrawalStatement): Promise<{ proof: ZKProof; nullifier: string }>;
}
