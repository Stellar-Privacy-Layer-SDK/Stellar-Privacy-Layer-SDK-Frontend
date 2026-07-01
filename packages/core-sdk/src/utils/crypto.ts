import { bn254 } from '@noble/curves/bn254.js';
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
  const hex = value.startsWith('0x') ? value.slice(2) : value;
  if (/^[0-9a-fA-F]+$/.test(hex)) return BigInt('0x' + hex);
  if (/^\d+$/.test(value)) return BigInt(value);
  const encoder = new TextEncoder();
  const bytes = encoder.encode(value);
  let result = 0n;
  for (const b of bytes) result = (result << 8n) + BigInt(b);
  return result;
}

export function poseidonHash(inputs: (string | bigint | number)[]): Promise<string> {
  const fieldEls = inputs.map((i) => Fr.create(toBigInt(i)));
  const padded = [...fieldEls, Fr.ZERO, Fr.ZERO].slice(0, POSEIDON_T);
  const result = _poseidonFn(padded);
  const hex = result[0].toString(16).padStart(64, '0');
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

export async function generateMerklePath(leaves: string[], index: number): Promise<string[]> {
  const path: string[] = [];
  let currentIndex = index;
  let level: string[] = [...leaves];
  while (level.length > 1) {
    const siblingIndex = currentIndex % 2 === 0 ? currentIndex + 1 : currentIndex - 1;
    if (siblingIndex < level.length) {
      path.push(level[siblingIndex]);
    } else {
      path.push(level[currentIndex]);
    }
    currentIndex = Math.floor(currentIndex / 2);
    const nextLevel: string[] = [];
    for (let i = 0; i < level.length; i += 2) {
      if (i + 1 < level.length) {
        nextLevel.push(await poseidonHash2(level[i], level[i + 1]));
      } else {
        nextLevel.push(level[i]);
      }
    }
    level = nextLevel;
  }
  return path;
}

export async function encryptWithPublicKey(data: string, publicKey: string): Promise<string> {
  const ivBytes = new Uint8Array(16);
  crypto.getRandomValues(ivBytes);
  const iv = Array.from(ivBytes).map((b) => b.toString(16).padStart(2, '0')).join('');
  const key = await sha256(publicKey);
  const cipher = await sha256(key + data + iv);
  return iv + ':' + cipher;
}

export async function decryptWithPrivateKey(encrypted: string, privateKey: string): Promise<string> {
  const parts = encrypted.split(':');
  if (parts.length !== 2) throw new Error('Decryption failed: invalid format');
  const iv = parts[0];
  const cipher = parts[1];
  const key = await sha256(privateKey);
  const combined = await sha256(key + iv);
  if (combined !== cipher) throw new Error('Decryption failed: invalid key or corrupted data');
  return combined;
}

export async function generateViewingKeyPair(): Promise<{ publicKey: string; privateKey: string }> {
  const privateKey = await generateRandomField();
  const publicKey = await sha256(privateKey);
  return { publicKey, privateKey };
}

export function bn254Fr(): typeof Fr {
  return Fr;
}
