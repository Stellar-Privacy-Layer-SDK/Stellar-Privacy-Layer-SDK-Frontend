import { bn254 } from '@noble/curves/bn254.js';
import { ed25519, x25519 } from '@noble/curves/ed25519.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 as nobleSha256 } from '@noble/hashes/sha2.js';
import { poseidon, grainGenConstants } from '@noble/curves/abstract/poseidon.js';

const Fr = bn254.fields.Fr;

const POSEIDON_T = 3;
const POSEIDON_FULL_ROUNDS = 8;
const POSEIDON_PARTIAL_ROUNDS = 57;
const POSEIDON_SBOX = 5;

const _poseidonConstants = grainGenConstants({
  Fp: Fr,
  t: POSEIDON_T,
  roundsFull: POSEIDON_FULL_ROUNDS,
  roundsPartial: POSEIDON_PARTIAL_ROUNDS,
  sboxPower: POSEIDON_SBOX,
});

const _poseidonFn = poseidon({
  ..._poseidonConstants,
  Fp: Fr,
  t: POSEIDON_T,
  roundsFull: POSEIDON_FULL_ROUNDS,
  roundsPartial: POSEIDON_PARTIAL_ROUNDS,
  sboxPower: POSEIDON_SBOX,
});

function toBigInt(value: string | bigint | number): bigint {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number') return BigInt(value);
  if (/^0x[0-9a-fA-F]+$/.test(value)) return BigInt(value);
  if (/^\d+$/.test(value)) return BigInt(value);
  const encoder = new TextEncoder();
  const bytes = encoder.encode(value);
  let result = 0n;
  for (const b of bytes) result = (result << 8n) + BigInt(b);
  return result;
}

/** Maps a value to the BN254 scalar field exactly as `poseidonHash` does. */
export function toFieldElement(value: string | bigint | number): bigint {
  return Fr.create(toBigInt(value));
}

/**
 * Poseidon hash over an arbitrary number of field elements using a sponge
 * construction (state of width `POSEIDON_T` absorbs `t-1` elements per
 * permutation round, chaining the previous output through `state[0]`).
 *
 * This correctly incorporates ALL inputs — the previous implementation
 * silently truncated inputs beyond three elements, which would have dropped
 * the `token` from commitment hashes.
 */
export function poseidonHash(inputs: (string | bigint | number)[]): Promise<string> {
  const fieldEls = inputs.map(toFieldElement);
  const chunkSize = POSEIDON_T - 1;

  let state: bigint[] = [Fr.ZERO, Fr.ZERO, Fr.ZERO];
  for (let i = 0; i < fieldEls.length; i += chunkSize) {
    const block: bigint[] = [state[0], ...fieldEls.slice(i, i + chunkSize)];
    while (block.length < POSEIDON_T) block.push(Fr.ZERO);
    state = _poseidonFn(block);
  }

  const hex = state[0].toString(16).padStart(64, '0');
  return Promise.resolve('0x' + hex);
}

export function sha256(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const hashBuffer = crypto.subtle.digest('SHA-256', encoder.encode(data));
  return hashBuffer.then((buf) => {
    const hashArray = Array.from(new Uint8Array(buf));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  });
}

export async function generateRandomField(): Promise<string> {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const rand = BigInt('0x' + Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join(''));
  const fieldElem = Fr.create(rand);
  return '0x' + fieldElem.toString(16).padStart(64, '0');
}

export async function generateNullifier(secret: string, index: number): Promise<string> {
  return poseidonHash([secret, index]);
}

export async function generateCommitment(
  secret: string,
  recipient: string,
  amount: string,
  token: string,
): Promise<string> {
  return poseidonHash([secret, recipient, amount, token]);
}

export async function poseidonHash2(left: string, right: string): Promise<string> {
  return poseidonHash([left, right]);
}

export async function computeMerkleRoot(leaves: string[]): Promise<string> {
  if (leaves.length === 0) return '0x' + '0'.repeat(64);
  if (leaves.length === 1) return leaves[0];
  const nextLevel: string[] = [];
  for (let i = 0; i < leaves.length; i += 2) {
    if (i + 1 < leaves.length) {
      nextLevel.push(await poseidonHash2(leaves[i], leaves[i + 1]));
    } else {
      nextLevel.push(leaves[i]);
    }
  }
  return computeMerkleRoot(nextLevel);
}

/** A sibling on a Merkle path, and which side of the running hash it sits on. */
export interface MerkleStep {
  sibling: string;
  position: 'left' | 'right';
}

/**
 * Builds the membership proof for `leaves[index]`. A node without a sibling is
 * promoted unchanged by {@link computeMerkleRoot} and adds no step.
 */
export async function generateMerkleProof(leaves: string[], index: number): Promise<MerkleStep[]> {
  if (!Number.isInteger(index) || index < 0 || index >= leaves.length) {
    throw new Error('Merkle leaf index out of range');
  }
  const steps: MerkleStep[] = [];
  let level = leaves;
  let current = index;
  while (level.length > 1) {
    const isRight = current % 2 === 1;
    const sibling = level[isRight ? current - 1 : current + 1];
    if (sibling !== undefined) {
      steps.push({ sibling, position: isRight ? 'left' : 'right' });
    }
    const next: string[] = [];
    for (let i = 0; i < level.length; i += 2) {
      next.push(i + 1 < level.length ? await poseidonHash2(level[i], level[i + 1]) : level[i]);
    }
    level = next;
    current = Math.floor(current / 2);
  }
  return steps;
}

/** Recomputes the root from a leaf and its proof and compares it to `root`. */
export async function verifyMerkleProof(
  leaf: string,
  steps: MerkleStep[],
  root: string,
): Promise<boolean> {
  let hash = leaf;
  for (const { sibling, position } of steps) {
    hash = position === 'left'
      ? await poseidonHash2(sibling, hash)
      : await poseidonHash2(hash, sibling);
  }
  return hash === root;
}

export async function generateMerklePath(leaves: string[], index: number): Promise<string[]> {
  return (await generateMerkleProof(leaves, index)).map((step) => step.sibling);
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

async function aesGcmEncrypt(plaintext: Uint8Array, key: Uint8Array, iv: Uint8Array): Promise<Uint8Array> {
  const keyCopy = Uint8Array.from(key);
  const dataCopy = Uint8Array.from(plaintext);
  const ivCopy = Uint8Array.from(iv);
  const cryptoKey = await crypto.subtle.importKey('raw', keyCopy, 'AES-GCM', false, ['encrypt']);
  return new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: ivCopy }, cryptoKey, dataCopy));
}

async function aesGcmDecrypt(ciphertext: Uint8Array, key: Uint8Array, iv: Uint8Array): Promise<Uint8Array> {
  const keyCopy = Uint8Array.from(key);
  const dataCopy = Uint8Array.from(ciphertext);
  const ivCopy = Uint8Array.from(iv);
  const cryptoKey = await crypto.subtle.importKey('raw', keyCopy, 'AES-GCM', false, ['decrypt']);
  return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: ivCopy }, cryptoKey, dataCopy));
}

function deriveKey(input: string): Uint8Array {
  const encoder = new TextEncoder();
  return nobleSha256(encoder.encode(input));
}

async function aesEncrypt(plaintext: Uint8Array, keyMaterial: Uint8Array): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const derivedKey = nobleSha256(hkdf(nobleSha256, keyMaterial, salt, new Uint8Array(0), 32));
  const ciphertext = await aesGcmEncrypt(plaintext, derivedKey, iv);
  return `${bytesToHex(salt)}:${bytesToHex(iv)}:${bytesToHex(ciphertext)}`;
}

async function aesDecrypt(encrypted: string, keyMaterial: Uint8Array): Promise<Uint8Array> {
  const parts = encrypted.split(':');
  if (parts.length !== 3) throw new Error('Decryption failed: invalid format');
  const salt = hexToBytes(parts[0]);
  const iv = hexToBytes(parts[1]);
  const ciphertext = hexToBytes(parts[2]);
  const derivedKey = nobleSha256(hkdf(nobleSha256, keyMaterial, salt, new Uint8Array(0), 32));
  return aesGcmDecrypt(ciphertext, derivedKey, iv);
}

/**
 * Encrypts a string with AES-256-GCM using a symmetric key derived from
 * `keyMaterial` (via HKDF-SHA256). This is SYMMETRIC encryption — both
 * parties must share the same key material. The previous names
 * (`encryptWithPublicKey` / `decryptWithPrivateKey`) implied asymmetric
 * cryptography, which this is not.
 */
export async function encryptWithKey(data: string, keyMaterial: string): Promise<string> {
  const key = deriveKey(keyMaterial);
  const encodedData = new TextEncoder().encode(data);
  return `02:v0:${await aesEncrypt(encodedData, key)}`;
}

/** Decrypts a value produced by {@link encryptWithKey} with the same key material. */
export async function decryptWithKey(encrypted: string, keyMaterial: string): Promise<string> {
  const parts = encrypted.split(':');
  if (parts.length < 2 || parts[0] !== '02') throw new Error('Decryption failed: invalid format');
  const key = deriveKey(keyMaterial);
  const inner = parts.slice(2).join(':');
  const decrypted = await aesDecrypt(inner, key);
  return new TextDecoder().decode(decrypted);
}

/**
 * Encrypts to an X25519 public key (hex) using an ephemeral key exchange, so
 * only the holder of the matching private key can decrypt.
 */
export async function sealToPublicKey(data: string, publicKey: string): Promise<string> {
  const ephemeral = x25519.utils.randomSecretKey();
  const shared = x25519.getSharedSecret(ephemeral, hexToBytes(publicKey));
  const sealed = await aesEncrypt(new TextEncoder().encode(data), shared);
  return `03:${bytesToHex(x25519.getPublicKey(ephemeral))}:${sealed}`;
}

/** Opens a value produced by {@link sealToPublicKey}. */
export async function openSealed(sealed: string, privateKey: string): Promise<string> {
  const [version, ephemeralPublicKey, ...rest] = sealed.split(':');
  if (version !== '03' || rest.length !== 3) throw new Error('Decryption failed: invalid format');
  const shared = x25519.getSharedSecret(hexToBytes(privateKey), hexToBytes(ephemeralPublicKey));
  return new TextDecoder().decode(await aesDecrypt(rest.join(':'), shared));
}

/** Converts a raw Ed25519 public key (a Stellar account key) to X25519 hex. */
export function ed25519PublicKeyToX25519(publicKey: Uint8Array): string {
  return bytesToHex(ed25519.utils.toMontgomery(publicKey));
}

/** Converts a raw Ed25519 seed (a Stellar secret key) to an X25519 private key in hex. */
export function ed25519SeedToX25519(seed: Uint8Array): string {
  return bytesToHex(ed25519.utils.toMontgomerySecret(seed));
}

export async function generateViewingKeyPair(): Promise<{ publicKey: string; privateKey: string }> {
  const privateKey = x25519.utils.randomSecretKey();
  const publicKey = x25519.getPublicKey(privateKey);
  return {
    privateKey: bytesToHex(privateKey),
    publicKey: bytesToHex(publicKey),
  };
}

export function bn254Fr(): typeof Fr {
  return Fr;
}
