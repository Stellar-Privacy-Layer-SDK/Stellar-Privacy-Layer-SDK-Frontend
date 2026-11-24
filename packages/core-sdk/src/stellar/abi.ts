import { toFieldElement } from '../utils/crypto';
import { fromHex } from '../utils/encoding';
import type { ZKProof } from '../types';

/** 32-byte big-endian encoding of a BN254 scalar, as the contract expects. */
export function fieldBytes(value: string): Uint8Array {
  return fromHex(toFieldElement(value).toString(16).padStart(64, '0'));
}

/** Curve point coordinates live in the base field, so they are not reduced. */
function coordinates(...values: string[]): Uint8Array {
  return fromHex(values.map((v) => BigInt(v).toString(16).padStart(64, '0')).join(''));
}

/**
 * Encodes a snarkjs proof for the contract's `Groth16Proof`. snarkjs lists Fp2
 * coordinates as [c0, c1]; the contract expects c1 || c0.
 */
export function encodeGroth16Proof({ pi_a, pi_b, pi_c }: ZKProof) {
  return {
    a: coordinates(pi_a[0], pi_a[1]),
    b: coordinates(pi_b[0][1], pi_b[0][0], pi_b[1][1], pi_b[1][0]),
    c: coordinates(pi_c[0], pi_c[1]),
  };
}
