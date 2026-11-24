import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SnarkjsProver } from './snarkjs-prover.js';

const { fullProve, verify } = vi.hoisted(() => ({ fullProve: vi.fn(), verify: vi.fn() }));
vi.mock('snarkjs', () => ({ groth16: { fullProve, verify } }));

const artifacts = { wasm: 'a.wasm', zkey: 'a.zkey', vkey: {} };
const statement = {
  secret: '0x1',
  recipient: '0x2',
  merkleProof: { root: '0x3', siblings: ['0x4'], positions: [1 as const] },
};

describe('SnarkjsProver', () => {
  beforeEach(() => {
    fullProve.mockResolvedValue({ proof: { pi_a: [] }, publicSignals: ['255', '3', '2'] });
    verify.mockResolvedValue(true);
  });

  it('proves with the circuit inputs', async () => {
    const prover = new SnarkjsProver(artifacts);
    expect(prover.isReady()).toBe(false);
    const result = await prover.proveWithdrawal(statement);
    expect(prover.isReady()).toBe(true);
    expect(result.nullifier).toBe('0x' + 'ff'.padStart(64, '0'));
    expect(fullProve).toHaveBeenCalledWith(
      { secret: '0x1', recipient: '0x2', root: '0x3', siblings: ['0x4'], positions: [1] },
      'a.wasm',
      'a.zkey',
    );
  });

  it('rejects a proof that does not verify', async () => {
    verify.mockResolvedValue(false);
    await expect(new SnarkjsProver(artifacts).proveWithdrawal(statement)).rejects.toThrow(
      'local verification',
    );
  });

  it('reports artifacts that cannot be loaded', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    await expect(
      new SnarkjsProver({ ...artifacts, wasm: 'https://x.test/a.wasm' }).initialize(),
    ).rejects.toThrow('404');
    vi.unstubAllGlobals();
  });
});
