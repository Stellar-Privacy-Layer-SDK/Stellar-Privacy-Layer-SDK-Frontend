import { groth16 } from 'snarkjs';
import { resolveArtifacts } from './artifacts.js';
import type { Prover, ProverArtifacts, WithdrawalStatement } from './prover.js';
import type { ZKProof } from '../types.js';

/** Groth16 prover for circuits/withdraw.circom. */
export class SnarkjsProver implements Prover {
  private ready = false;

  constructor(private artifacts: ProverArtifacts) {}

  /** Loads artifacts given as URLs. Throws when one cannot be fetched. */
  async initialize(): Promise<void> {
    if (this.ready) return;
    this.artifacts = await resolveArtifacts(this.artifacts);
    this.ready = true;
  }

  isReady(): boolean {
    return this.ready;
  }

  async proveWithdrawal(
    statement: WithdrawalStatement,
  ): Promise<{ proof: ZKProof; nullifier: string }> {
    await this.initialize();
    const { root, siblings, positions } = statement.merkleProof;
    const { proof, publicSignals } = await groth16.fullProve(
      {
        root,
        recipient: statement.recipient,
        secret: statement.secret,
        siblings,
        positions,
      },
      this.artifacts.wasm,
      this.artifacts.zkey,
    );
    if (!(await groth16.verify(this.artifacts.vkey, publicSignals, proof))) {
      throw new Error('Withdrawal proof failed local verification');
    }
    return { proof, nullifier: '0x' + BigInt(publicSignals[0]).toString(16).padStart(64, '0') };
  }
}
