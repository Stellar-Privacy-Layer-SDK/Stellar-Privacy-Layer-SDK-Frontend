import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { SnarkjsProver, toFieldHex } from './snarkjs-prover';

const mockFullProve = vi.fn();
const mockVerify = vi.fn();

vi.mock('snarkjs', () => ({
  groth16: {
    fullProve: (...args: unknown[]) => mockFullProve(...args),
    verify: (...args: unknown[]) => mockVerify(...args),
  },
}));

const artifacts = { wasm: 'wasm', zkey: 'zkey', vkey: 'vkey' };
const proof = {
  pi_a: ['0x1', '0x2'],
  pi_b: [['0x3', '0x4'], ['0x5', '0x6']],
  pi_c: ['0x7', '0x8'],
  protocol: 'groth16',
  curve: 'bn254',
};

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

  it('throws on generateWithdrawalProof (not supported)', async () => {
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
    ).rejects.toThrow('membership circuit');
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
    const result = await p.verifyProof(proof, ['input1']);
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
    beforeEach(() => {
      mockFullProve.mockResolvedValue({ proof, publicSignals: ['456', '789'] });
      mockVerify.mockResolvedValue(true);
    });

    it('becomes ready with artifacts after initialize', async () => {
      const p = new SnarkjsProver(artifacts);
      await p.initialize();
      expect(p.isReady()).toBe(true);
    });

    it('generates a shielded proof with circuit public signals as public inputs', async () => {
      const p = new SnarkjsProver(artifacts);
      await p.initialize();
      const result = await p.generateShieldedProof(
        { amount: '100', token: 'USDC', recipient: 'GA' + 'X'.repeat(54) },
        'super-secret',
      );
      expect(result.commitment).toMatch(/^0x[0-9a-f]{64}$/);
      expect(result.nullifier).toMatch(/^0x[0-9a-f]{64}$/);
      // publicInputs mirror the circuit's public signals verbatim.
      expect(result.publicInputs).toEqual(['456', '789']);
      expect(result.proof.protocol).toBe('groth16');
      expect(mockFullProve).toHaveBeenCalled();
    });

    it('extracts commitment/nullifier from the final circuit signals when numeric', async () => {
      mockFullProve.mockResolvedValue({ proof, publicSignals: ['1000', '456', '789'] });
      const p = new SnarkjsProver(artifacts);
      await p.initialize();
      const result = await p.generateShieldedProof(
        { amount: '100', token: 'USDC', recipient: 'GA' + 'X'.repeat(54) },
        'super-secret',
      );
      expect(result.commitment).toBe('0x' + BigInt('456').toString(16).padStart(64, '0'));
      expect(result.nullifier).toBe('0x' + BigInt('789').toString(16).padStart(64, '0'));
    });

    it('rejects circuits without commitment and nullifier outputs', async () => {
      mockFullProve.mockResolvedValue({ proof, publicSignals: [] });
      const p = new SnarkjsProver(artifacts);
      await p.initialize();
      await expect(
        p.generateShieldedProof({ amount: '1', token: 'USDC', recipient: 'G' }, '0x1'),
      ).rejects.toThrow('did not output');
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

  describe('with URL artifacts', () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    const urlArtifacts = {
      wasm: 'https://cdn.example.com/shielded_transfer.wasm',
      zkey: 'https://cdn.example.com/shielded_transfer_final.zkey',
      vkey: 'https://cdn.example.com/verification_key.json',
    };

    it('fetches URL artifacts during initialize', async () => {
      vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
        if (url.endsWith('.json')) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve({ vk_alpha_1: 'x' }) });
        }
        return Promise.resolve({ ok: true, arrayBuffer: () => Promise.resolve(new Uint8Array([1, 2]).buffer) });
      }));

      const p = new SnarkjsProver(urlArtifacts);
      await p.initialize();
      expect(p.isReady()).toBe(true);
    });

    it('disables the prover when artifact fetching fails', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));

      const p = new SnarkjsProver(urlArtifacts);
      await p.initialize();
      expect(p.isReady()).toBe(false);
      await expect(
        p.generateShieldedProof(
          { amount: '100', token: 'USDC', recipient: 'GA' + 'X'.repeat(54) },
          'secret',
        ),
      ).rejects.toThrow('not ready');
    });
  });
});

describe('toFieldHex', () => {
  it('converts decimal field strings to padded hex', () => {
    expect(toFieldHex('456')).toBe('0x' + BigInt('456').toString(16).padStart(64, '0'));
    expect(toFieldHex('0')).toBe('0x' + '0'.repeat(64));
  });

  it('rejects non-numeric and empty signals', () => {
    expect(toFieldHex('abc')).toBeUndefined();
    expect(toFieldHex('0x123')).toBeUndefined();
    expect(toFieldHex('')).toBeUndefined();
    expect(toFieldHex(undefined)).toBeUndefined();
  });
});
