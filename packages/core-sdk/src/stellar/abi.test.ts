import { describe, expect, it } from 'vitest';
import { encodeGroth16Proof, fieldBytes, payoutField } from './abi.js';
import { toHex } from '../utils/encoding.js';

describe('fieldBytes', () => {
  it('encodes hex and decimal values as 32 bytes', () => {
    expect(toHex(fieldBytes('0x' + 'ab'.padStart(64, '0')))).toBe('ab'.padStart(64, '0'));
    expect(fieldBytes('256')).toHaveLength(32);
    expect(toHex(fieldBytes('256'))).toBe('100'.padStart(64, '0'));
  });
});

describe('encodeGroth16Proof', () => {
  it('serializes points with Fp2 coordinates as c1 || c0', () => {
    const word = (n: number) => n.toString(16).padStart(64, '0');
    const encoded = encodeGroth16Proof({
      pi_a: ['1', '2'],
      pi_b: [['3', '4'], ['5', '6']],
      pi_c: ['7', '0x8'],
      protocol: 'groth16',
      curve: 'bn128',
    });
    expect(toHex(encoded.a)).toBe(word(1) + word(2));
    expect(toHex(encoded.b)).toBe(word(4) + word(3) + word(6) + word(5));
    expect(toHex(encoded.c)).toBe(word(7) + word(8));
  });
});

describe('payoutField', () => {
  it('depends on every part and fits the field', () => {
    const a = 'CA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJUWDA';
    const b = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';
    const values = [payoutField(a, b, '1'), payoutField(b, a, '1'), payoutField(a, b, '2')];
    expect(new Set(values).size).toBe(3);
    values.forEach((v) => expect(v).toMatch(/^0x00[0-9a-f]{62}$/));
  });
});
