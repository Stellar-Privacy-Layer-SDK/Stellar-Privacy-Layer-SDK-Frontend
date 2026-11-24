import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { SnarkjsProver } from './snarkjs-prover';
import { generateCommitment, generateNullifier, generateRandomField } from '../utils/crypto';

// Real circuit artifacts; generate them with `npm run build:circuits`.
const artifact = (name: string) =>
  fileURLToPath(new URL(`../../../../artifacts/${name}`, import.meta.url));
const available = existsSync(artifact('shielded_transfer_final.zkey'));

describe.skipIf(!available)('SnarkjsProver with the compiled circuit', () => {
  afterAll(async () => {
    const { curves } = (await import('snarkjs')) as unknown as {
      curves: { getCurveFromName(name: string): Promise<{ terminate(): Promise<void> }> };
    };
    await (await curves.getCurveFromName('bn128')).terminate();
  });

  it('produces a verifiable proof matching the SDK hashes', async () => {
    const prover = new SnarkjsProver({
      wasm: artifact('shielded_transfer.wasm'),
      zkey: artifact('shielded_transfer_final.zkey'),
      vkey: JSON.parse(readFileSync(artifact('verification_key.json'), 'utf8')),
    });
    await prover.initialize();
    const secret = await generateRandomField();
    const params = { amount: '12.5', token: 'USDC', recipient: 'GA' + 'X'.repeat(54) };

    const result = await prover.generateShieldedProof(params, secret);

    expect(result.commitment).toBe(
      await generateCommitment(secret, params.recipient, params.amount, params.token),
    );
    expect(result.nullifier).toBe(await generateNullifier(secret, 0));
    expect(await prover.verifyProof(result.proof, result.publicInputs)).toBe(true);
    expect(await prover.verifyProof(result.proof, ['1', result.publicInputs[1]])).toBe(false);
  }, 60_000);
});
