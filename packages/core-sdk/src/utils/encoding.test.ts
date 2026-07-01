import { describe, it, expect } from 'vitest';
import {
  toHex,
  fromHex,
  toBase64,
  fromBase64,
  truncateAddress,
  formatUnits,
  parseUnits,
  sanitizeMemo,
  isValidPublicKey,
  isValidAmount,
} from './encoding';

describe('toHex', () => {
  it('converts bytes to hex', () => {
    expect(toHex(new Uint8Array([0, 255, 128]))).toBe('00ff80');
  });
});

describe('fromHex', () => {
  it('converts hex to bytes', () => {
    expect(Array.from(fromHex('00ff80'))).toEqual([0, 255, 128]);
  });

  it('handles 0x prefix', () => {
    expect(Array.from(fromHex('0x00ff80'))).toEqual([0, 255, 128]);
  });
});

describe('toBase64 / fromBase64', () => {
  it('round-trips', () => {
    const original = new Uint8Array([72, 101, 108, 108, 111]);
    const encoded = toBase64(original);
    const decoded = fromBase64(encoded);
    expect(Array.from(decoded)).toEqual([72, 101, 108, 108, 111]);
  });
});

describe('truncateAddress', () => {
  it('truncates long addresses', () => {
    const result = truncateAddress('GA' + 'X'.repeat(55), 6);
    expect(result).toBe('GAXXXX...XXXX');
  });
});

describe('formatUnits / parseUnits', () => {
  it('formatUnits formats with decimals', () => {
    expect(formatUnits('1000000', 7)).toBe('0.1000000');
  });

  it('parseUnits parses with decimals', () => {
    expect(parseUnits('0.1000000', 7)).toBe('1000000');
  });
});

describe('sanitizeMemo', () => {
  it('removes special characters and truncates', () => {
    expect(sanitizeMemo('hello!@#world' + 'x'.repeat(30))).toHaveLength(28);
    expect(sanitizeMemo('hello!@#world')).toBe('helloworld');
  });
});

describe('isValidPublicKey', () => {
  it('accepts valid G... keys', () => {
    expect(isValidPublicKey('GA' + 'X'.repeat(54))).toBe(true);
  });

  it('rejects invalid keys', () => {
    expect(isValidPublicKey('')).toBe(false);
    expect(isValidPublicKey('XYZ')).toBe(false);
    expect(isValidPublicKey('SA' + 'X'.repeat(54))).toBe(false);
  });
});

describe('isValidAmount', () => {
  it('accepts valid amounts', () => {
    expect(isValidAmount('100')).toBe(true);
    expect(isValidAmount('0.01')).toBe(true);
  });

  it('rejects invalid amounts', () => {
    expect(isValidAmount('0')).toBe(false);
    expect(isValidAmount('-5')).toBe(false);
    expect(isValidAmount('abc')).toBe(false);
  });
});
