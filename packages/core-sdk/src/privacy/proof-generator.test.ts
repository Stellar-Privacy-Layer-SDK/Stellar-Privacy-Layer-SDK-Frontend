import { describe, it, expect, beforeAll } from 'vitest';
import { ProofGenerator } from './proof-generator';
import type { ZKProof } from '../types';

describe('ProofGenerator', () => {
  let pg: ProofGenerator;

  beforeAll(async () => {
    pg = new ProofGenerator();
    await pg.initialize();
  });

  it('initializes and reports ready', () => {
    expect(pg.isReady()).toBe(true);
  });

  describe('generateShieldedTransferProof', () => {
    it('generates proof with valid structure', async () => {
      const result = await pg.generateShieldedTransferProof({
        amount: '100',
        token: 'USDC',
        recipient: 'GA' + 'X'.repeat(54),
      });

      expect(result.proof).toBeDefined();
      expect(result.proof.protocol).toBe('groth16');
      expect(result.proof.curve).toBe('bn254');
      expect(result.proof.pi_a).toHaveLength(2);
      expect(result.proof.pi_b).toHaveLength(2);
      expect(result.proof.pi_b[0]).toHaveLength(2);
      expect(result.proof.pi_b[1]).toHaveLength(2);
      expect(result.proof.pi_c).toHaveLength(2);

      expect(result.commitment).toMatch(/^0x[0-9a-f]{64}$/);
      expect(result.nullifier).toMatch(/^0x[0-9a-f]{64}$/);
      expect(result.publicInputs).toHaveLength(4);
    });

    it('produces different proofs for different inputs', async () => {
      const a = await pg.generateShieldedTransferProof({
        amount: '100',
        token: 'USDC',
        recipient: 'GA' + 'A'.repeat(54),
      });
      const b = await pg.generateShieldedTransferProof({
        amount: '200',
        token: 'USDC',
        recipient: 'GA' + 'B'.repeat(54),
      });
      expect(a.commitment).not.toBe(b.commitment);
      expect(a.nullifier).not.toBe(b.nullifier);
    });
  });

  describe('verifyProof', () => {
    it('verifies a valid proof', async () => {
      const { proof, publicInputs } = await pg.generateShieldedTransferProof({
        amount: '50',
        token: 'XLM',
        recipient: 'GA' + 'C'.repeat(54),
      });

      const valid = await pg.verifyProof(proof, publicInputs);
      expect(valid).toBe(true);
    });

    it('rejects tampered proof', async () => {
      const { proof, publicInputs } = await pg.generateShieldedTransferProof({
        amount: '30',
        token: 'USDC',
        recipient: 'GA' + 'D'.repeat(54),
      });

      const tampered: ZKProof = { ...proof, pi_a: ['0x0', '0x0'] };
      const valid = await pg.verifyProof(tampered, publicInputs);
      expect(valid).toBe(false);
    });
  });

  describe('generateWithdrawalProof', () => {
    it('generates a valid withdrawal proof', async () => {
      const proof = await pg.generateWithdrawalProof(
        '0x' + 'a'.repeat(64),
        '0x' + 'b'.repeat(64),
        ['0x' + 'c'.repeat(64)],
        'GA' + 'E'.repeat(54),
        '75',
      );

      expect(proof.protocol).toBe('groth16');
      expect(proof.curve).toBe('bn254');
      expect(proof.pi_a).toHaveLength(2);
    });
  });

  describe('generateDisclosureProof', () => {
    it('generates a valid disclosure proof', async () => {
      const proof = await pg.generateDisclosureProof(
        '0x' + 'a'.repeat(64),
        '100',
        'GA' + 'F'.repeat(54),
        'GA' + 'G'.repeat(54),
      );

      expect(proof.protocol).toBe('groth16');
      expect(proof.pi_a).toHaveLength(2);
    });
  });
});
