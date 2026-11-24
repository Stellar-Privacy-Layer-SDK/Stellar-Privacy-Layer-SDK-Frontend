import { describe, it, expect } from 'vitest';
import { Keypair } from '@stellar/stellar-sdk';
import {
  poseidonHash,
  toFieldElement,
  sealToPublicKey,
  openSealed,
  ed25519PublicKeyToX25519,
  ed25519SeedToX25519,
  sha256,
  generateRandomField,
  poseidonHash2,
  generateViewingKeyPair,
  encryptWithKey,
  decryptWithKey,
} from './crypto.js';

describe('poseidonHash', () => {
  it('returns a 0x-prefixed 64-char hex string', async () => {
    const result = await poseidonHash(['123', '456']);
    expect(result).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it('is deterministic for same inputs', async () => {
    const a = await poseidonHash(['hello', 'world']);
    const b = await poseidonHash(['hello', 'world']);
    expect(a).toBe(b);
  });

  it('changes output when any input changes', async () => {
    const a = await poseidonHash(['hello', 'world']);
    const b = await poseidonHash(['hello', 'wrld']);
    expect(a).not.toBe(b);
  });

  it('handles bigint inputs', async () => {
    const a = await poseidonHash([BigInt('0x1234')]);
    expect(a).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it('handles numeric inputs', async () => {
    const result = await poseidonHash([1, 2, 3]);
    expect(result).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it('hashes a single input', async () => {
    const result = await poseidonHash(['only']);
    expect(result).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it('hashes more than three inputs without truncation', async () => {
    const a = await poseidonHash(['a', 'b', 'c', 'd']);
    expect(a).toMatch(/^0x[0-9a-f]{64}$/);
    const a2 = await poseidonHash(['a', 'b', 'c', 'd']);
    expect(a).toBe(a2);
    // Changing the 4th input must change the output (proves it is included).
    const b = await poseidonHash(['a', 'b', 'c', 'e']);
    expect(a).not.toBe(b);
  });

  it('hashes long input lists consistently', async () => {
    const inputs = ['x1', 'x2', 'x3', 'x4', 'x5', 'x6', 'x7'];
    const a = await poseidonHash(inputs);
    const b = await poseidonHash(inputs);
    expect(a).toBe(b);
    expect(a).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it('hashes an empty input list deterministically', async () => {
    const a = await poseidonHash([]);
    const b = await poseidonHash([]);
    expect(a).toBe(b);
  });
});

describe('sha256', () => {
  it('returns a hex string', async () => {
    const result = await sha256('test');
    expect(result).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic', async () => {
    const a = await sha256('test');
    const b = await sha256('test');
    expect(a).toBe(b);
  });
});

describe('generateRandomField', () => {
  it('returns a 0x-prefixed 64-char hex', async () => {
    const result = await generateRandomField();
    expect(result).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it('generates different values each call', async () => {
    const a = await generateRandomField();
    const b = await generateRandomField();
    expect(a).not.toBe(b);
  });
});

describe('toFieldElement', () => {
  it('distinguishes decimal, 0x-prefixed hex and text', () => {
    expect(toFieldElement('100')).toBe(100n);
    expect(toFieldElement('0x100')).toBe(256n);
    expect(toFieldElement('abc')).toBe(0x616263n);
  });

  it('matches the circomlib Poseidon test vector', async () => {
    expect(BigInt(await poseidonHash([1, 2]))).toBe(
      7853200120776062878684798364095072458815029376092732009249414926327459813530n,
    );
  });
});

describe('poseidonHash2', () => {
  it('hashes two field elements', async () => {
    const h = await poseidonHash2('0x' + 'a'.repeat(64), '0x' + 'b'.repeat(64));
    expect(h).toMatch(/^0x[0-9a-f]{64}$/);
  });
});

describe('generateViewingKeyPair', () => {
  it('returns public and private key', async () => {
    const kp = await generateViewingKeyPair();
    expect(kp.publicKey).toMatch(/^[0-9a-f]{64}$/);
    expect(kp.privateKey).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('encryptWithKey / decryptWithKey (symmetric AES-GCM)', () => {
  it('encrypts and decrypts correctly', async () => {
    const data = 'sensitive-viewing-key-data';
    const kp = await generateViewingKeyPair();
    const encrypted = await encryptWithKey(data, kp.publicKey);
    expect(encrypted).toContain(':');
    const parts = encrypted.split(':');
    expect(parts[0]).toBe('02');
    expect(parts[1]).toBe('v0');

    const decrypted = await decryptWithKey(encrypted, kp.publicKey);
    expect(decrypted).toBe(data);
  });

  it('rejects decryption with wrong key', async () => {
    const data = 'secret-data';
    const kp1 = await generateViewingKeyPair();
    const kp2 = await generateViewingKeyPair();
    const encrypted = await encryptWithKey(data, kp1.publicKey);
    await expect(decryptWithKey(encrypted, kp2.publicKey)).rejects.toThrow();
  });

  it('rejects corrupt encrypted data', async () => {
    await expect(decryptWithKey('invalid', 'key')).rejects.toThrow('invalid format');
    await expect(decryptWithKey('02:bad:data', 'key')).rejects.toThrow();
  });
});

describe('sealed encryption', () => {
  it('is readable only with the recipient private key', async () => {
    const recipient = await generateViewingKeyPair();
    const other = await generateViewingKeyPair();
    const sealed = await sealToPublicKey('secret', recipient.publicKey);
    expect(await openSealed(sealed, recipient.privateKey)).toBe('secret');
    await expect(openSealed(sealed, other.privateKey)).rejects.toThrow();
    await expect(openSealed('02:bad', recipient.privateKey)).rejects.toThrow('invalid format');
  });

  it('seals to a Stellar account key', async () => {
    const account = Keypair.random();
    const sealed = await sealToPublicKey('hi', ed25519PublicKeyToX25519(account.rawPublicKey()));
    expect(await openSealed(sealed, ed25519SeedToX25519(account.rawSecretKey()))).toBe('hi');
  });
});
