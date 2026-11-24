import { describe, it, expect, beforeAll, vi } from 'vitest';
import { ProofVerifier } from './verifier';
import { ProofGenerator } from './proof-generator';
import { SimulatedProver } from './simulated-prover';
import { StellarClient } from '../stellar/client';
import type { ZKProof } from '../types';

function validProof(): ZKProof {
  return {
    pi_a: ['0x1', '0x0'],
    pi_b: [['0x2', '0x2'], ['0x2', '0x2']],
    pi_c: ['0x3', '0x3'],
    protocol: 'groth16',
    curve: 'bn254',
  };
}

describe('ProofVerifier', () => {
  let verifier: ProofVerifier;
  let client: StellarClient;
  const prover = new SimulatedProver();

  beforeAll(() => {
    client = new StellarClient();
    verifier = new ProofVerifier(client, new ProofGenerator(prover));
  });

  describe('verifyProofStructure', () => {
    it('accepts valid proof structure', () => {
      expect(verifier.verifyProofStructure(validProof())).toBe(true);
    });

    it('rejects non-object', () => {
      expect(verifier.verifyProofStructure(null)).toBe(false);
      expect(verifier.verifyProofStructure('string')).toBe(false);
    });

    it('rejects proof with missing fields', () => {
      expect(verifier.verifyProofStructure({})).toBe(false);
    });
  });

  describe('verifyProof', () => {
    it('uses the configured prover', async () => {
      const verify = vi.spyOn(prover, 'verifyProof').mockResolvedValue(true);
      expect(await verifier.verifyProof(validProof(), ['1'])).toBe(true);
      expect(verify).toHaveBeenCalledWith(validProof(), ['1']);
      verify.mockRestore();
    });

    it('rejects malformed proofs', async () => {
      expect(await verifier.verifyProof({} as ZKProof, ['1'])).toBe(false);
    });
  });

  it('propagates on-chain verification failures', async () => {
    await expect(verifier.verifyProofOnChain(validProof(), ['1'])).rejects.toThrow(
      'Wallet not connected',
    );
  });
});
