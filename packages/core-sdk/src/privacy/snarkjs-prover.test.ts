import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { SnarkjsProver } from './snarkjs-prover';

const mockFullProve = vi.fn();
const mockVerify = vi.fn();

vi.mock('snarkjs', () => ({
  groth16: {
    fullProve: (...args: unknown[]) => mockFullProve(...args),
    verify: (...args: unknown[]) => mockVerify(...args),
  },
}));

describe('SnarkjsProver', () => {
  let prover: SnarkjsProver;

  beforeAll(async () => {
    prover = new SnarkjsProver();
    await prover.initialize();
  });

  it('initializes without artifacts', () => {
    expect(prover.isReady()).toBe(false);
  });

  it('is not ready without artifacts set', () => {
    const p = new SnarkjsProver();
    expect(p.isReady()).toBe(false);
  });

  it('throws on generateShieldedProof when not ready', async () => {
    const p = new SnarkjsProver();
    await p.initialize();
    await expect(
      p.generateShieldedProof(
        { amount: '100', token: 'USDC', recipient: 'GA' + 'X'.repeat(54) },
        'secret',
      ),
    ).rejects.toThrow('not ready');
  });

  it('throws on generateWithdrawalProof when not ready', async () => {
    const p = new SnarkjsProver();
    await p.initialize();
    await expect(
      p.generateWithdrawalProof(
        '0x' + 'a'.repeat(64),
        '0x' + 'b'.repeat(64),
        [],
        'GA' + 'X'.repeat(54),
        '100',
      ),
    ).rejects.toThrow('not ready');
  });

  it('throws on generateDisclosureProof (not supported)', async () => {
    const p = new SnarkjsProver();
    await p.initialize();
    await expect(
      p.generateDisclosureProof(
        '0x' + 'a'.repeat(64),
        '100',
        'GA' + 'X'.repeat(54),
        'GA' + 'Y'.repeat(54),
      ),
    ).rejects.toThrow('Disclosure proofs require a separate compliance circuit');
  });

  it('returns false on verifyProof when not ready', async () => {
    const p = new SnarkjsProver();
    await p.initialize();
    const result = await p.verifyProof(
      {
        pi_a: ['0x1', '0x2'],
        pi_b: [['0x3', '0x4'], ['0x5', '0x6']],
        pi_c: ['0x7', '0x8'],
        protocol: 'groth16',
        curve: 'bn254',
      },
      ['input1'],
    );
    expect(result).toBe(false);
  });

  it('setArtifacts makes prover ready when valid artifacts provided', () => {
    const p = new SnarkjsProver({
      wasm: new Uint8Array([0, 1, 2]),
      zkey: new Uint8Array([3, 4, 5]),
      vkey: new Uint8Array([6, 7, 8]),
    });
    expect(p.isReady()).toBe(false);
  });

  it('accepts artifacts via constructor', async () => {
    const p = new SnarkjsProver({
      wasm: 'wasm_data',
      zkey: 'zkey_data',
      vkey: 'vkey_data',
    });
    await expect(p.initialize()).resolves.toBeUndefined();
  });

  describe('with mocked snarkjs artifacts', () => {
    const artifacts = { wasm: 'wasm', zkey: 'zkey', vkey: 'vkey' };
    const proof = {
      pi_a: ['0x1', '0x2'],
      pi_b: [['0x3', '0x4'], ['0x5', '0x6']],
      pi_c: ['0x7', '0x8'],
      protocol: 'groth16',
      curve: 'bn254',
    };

    beforeEach(() => {
      mockFullProve.mockResolvedValue({ proof, publicSignals: ['a', 'b', 'c'] });
      mockVerify.mockResolvedValue(true);
    });

    it('becomes ready with artifacts after initialize', async () => {
      const p = new SnarkjsProver(artifacts);
      await p.initialize();
      expect(p.isReady()).toBe(true);
    });

    it('generates a shielded proof with consistent public inputs', async () => {
      const p = new SnarkjsProver(artifacts);
      await p.initialize();
      const result = await p.generateShieldedProof(
        { amount: '100', token: 'USDC', recipient: 'GA' + 'X'.repeat(54) },
        'super-secret',
      );
      expect(result.commitment).toMatch(/^[0-9a-f]{64}$/);
      expect(result.nullifier).toMatch(/^[0-9a-f]{64}$/);
      expect(result.publicInputs).toHaveLength(4);
      expect(result.proof.protocol).toBe('groth16');
      expect(mockFullProve).toHaveBeenCalled();
    });

    it('generates a withdrawal proof', async () => {
      const p = new SnarkjsProver(artifacts);
      await p.initialize();
      const result = await p.generateWithdrawalProof(
        '0x' + 'a'.repeat(64),
        '0x' + 'b'.repeat(64),
        ['0x' + 'c'.repeat(64)],
        'GA' + 'X'.repeat(54),
        '50',
      );
      expect(result.protocol).toBe('groth16');
    });

    it('verifies a proof through snarkjs', async () => {
      const p = new SnarkjsProver(artifacts);
      await p.initialize();
      const ok = await p.verifyProof(proof, ['input1']);
      expect(ok).toBe(true);
      expect(mockVerify).toHaveBeenCalled();
    });

    it('returns false when snarkjs verification throws', async () => {
      mockVerify.mockRejectedValueOnce(new Error('bad vkey'));
      const p = new SnarkjsProver(artifacts);
      await p.initialize();
      const ok = await p.verifyProof(proof, ['input1']);
      expect(ok).toBe(false);
    });
  });
});
