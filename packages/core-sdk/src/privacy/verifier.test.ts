import { describe, it, expect, beforeAll } from 'vitest';
import { ProofVerifier } from './verifier';
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

  beforeAll(() => {
    client = new StellarClient();
    verifier = new ProofVerifier(client);
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

  describe('generateVerificationKey', () => {
    it('generates a key string', async () => {
      const key = await verifier.generateVerificationKey();
      expect(key).toBeTruthy();
      expect(typeof key).toBe('string');
    });

    it('generates different keys on each call', async () => {
      const k1 = await verifier.generateVerificationKey();
      const k2 = await verifier.generateVerificationKey();
      expect(k1).not.toBe(k2);
    });
  });
});
