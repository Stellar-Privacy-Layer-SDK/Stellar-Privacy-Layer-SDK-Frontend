import { Keypair } from '@stellar/stellar-sdk';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HttpRelayer, parseWithdrawalRequest } from './relayer.js';

const request = {
  root: '0x' + '1'.repeat(64),
  nullifier: '0x' + '2'.repeat(64),
  recipient: Keypair.random().publicKey(),
  proof: {
    pi_a: ['1', '2', '1'],
    pi_b: [['3', '4'], ['5', '6'], ['1', '0']],
    pi_c: ['7', '8', '1'],
  },
};

describe('parseWithdrawalRequest', () => {
  it('accepts snarkjs proofs and drops extra data', () => {
    const parsed = parseWithdrawalRequest({ ...request, extra: 1 });
    expect(parsed.proof.pi_a).toEqual(['1', '2']);
    expect(parsed).not.toHaveProperty('extra');
  });

  it.each([
    null,
    {},
    { ...request, root: '1' },
    { ...request, recipient: 'G' },
    { ...request, proof: { ...request.proof, pi_a: ['x', '1'] } },
    { ...request, proof: { ...request.proof, pi_b: [['1', '2']] } },
    { ...request, proof: { ...request.proof, pi_c: ['9'.repeat(78), '1'] } },
  ])('rejects malformed input %#', (input) => {
    expect(() => parseWithdrawalRequest(input)).toThrow('Invalid withdrawal request');
  });
});

describe('HttpRelayer', () => {
  afterEach(() => vi.unstubAllGlobals());
  const send = (response: object) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
    return new HttpRelayer('https://r.test/').withdraw(parseWithdrawalRequest(request));
  };

  it('returns the transaction hash', async () => {
    expect(await send({ ok: true, json: async () => ({ txHash: 'h' }) })).toBe('h');
    expect(fetch).toHaveBeenCalledWith('https://r.test/withdraw', expect.anything());
  });

  it('reports errors', async () => {
    await expect(send({ ok: false, status: 400, json: async () => ({ error: 'bad' }) })).rejects.toThrow('bad');
    await expect(send({ ok: false, status: 502, json: () => Promise.reject(new Error()) })).rejects.toThrow('502');
  });
});
