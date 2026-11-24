import { isValidPublicKey } from '../utils/encoding.js';
import type { ZKProof } from '../types.js';

export interface WithdrawalRequest {
  proof: ZKProof;
  root: string;
  nullifier: string;
  recipient: string;
}

/** Submits withdrawals from its own account, so the user's stays hidden. */
export interface Relayer {
  withdraw(request: WithdrawalRequest): Promise<string>;
}

export class HttpRelayer implements Relayer {
  constructor(private url: string) {}

  async withdraw(request: WithdrawalRequest): Promise<string> {
    const response = await fetch(`${this.url.replace(/\/+$/, '')}/withdraw`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
    });
    const body = (await response.json().catch(() => ({}))) as { txHash?: string; error?: string };
    if (!response.ok || !body.txHash) {
      throw new Error(`Relayer error: ${body.error ?? `HTTP ${response.status}`}`);
    }
    return body.txHash;
  }
}

/** Validates untrusted input; throws on anything malformed. */
export function parseWithdrawalRequest(input: unknown): WithdrawalRequest {
  const { proof, root, nullifier, recipient } = (input ?? {}) as Record<string, unknown>;
  const p = (proof ?? {}) as Record<string, unknown>;
  const hex = (v: unknown): v is string => typeof v === 'string' && /^0x[0-9a-f]{64}$/.test(v);
  const decimal = (v: unknown) => typeof v === 'string' && /^\d{1,78}$/.test(v) && BigInt(v) < 1n << 256n;
  // snarkjs appends a projective coordinate, which is not used.
  const point = (v: unknown): v is string[] => Array.isArray(v) && v.length >= 2 && v.slice(0, 2).every(decimal);
  const point2 = (v: unknown): v is string[][] => Array.isArray(v) && v.length >= 2 && v.slice(0, 2).every(point);
  if (
    !hex(root) || !hex(nullifier) || typeof recipient !== 'string' || !isValidPublicKey(recipient) ||
    !point(p.pi_a) || !point2(p.pi_b) || !point(p.pi_c)
  ) {
    throw new Error('Invalid withdrawal request');
  }
  return {
    root,
    nullifier,
    recipient,
    proof: {
      pi_a: [p.pi_a[0], p.pi_a[1]],
      pi_b: [[p.pi_b[0][0], p.pi_b[0][1]], [p.pi_b[1][0], p.pi_b[1][1]]],
      pi_c: [p.pi_c[0], p.pi_c[1]],
      protocol: 'groth16',
      curve: 'bn128',
    },
  };
}
