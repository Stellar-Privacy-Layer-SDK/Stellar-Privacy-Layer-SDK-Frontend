import type { StorageProvider } from '../types.js';
import { fromBase64, toBase64 } from './encoding.js';

const SALT_KEY = 'vault_salt';
const CHECK_KEY = 'vault_check';
const CHECK_VALUE = 'unlocked';
const PREFIX = 'enc1:';
const ITERATIONS = 600_000;

export class WrongPasswordError extends Error {
  constructor() {
    super('Wrong password');
  }
}

/** True when `inner` was set up with {@link unlockEncryptedStorage} before. */
export async function hasEncryptedStorage(inner: StorageProvider): Promise<boolean> {
  return (await inner.get(CHECK_KEY)) !== null;
}

/**
 * Wraps a provider so values are AES-256-GCM encrypted under a password
 * (PBKDF2-SHA256). The first call sets the password. Plaintext left by earlier
 * versions stays readable and is encrypted when read.
 */
export async function unlockEncryptedStorage(
  inner: StorageProvider,
  password: string,
): Promise<StorageProvider> {
  if (!password) throw new Error('Password is required');
  let salt = await inner.get(SALT_KEY);
  if (!salt) {
    salt = toBase64(crypto.getRandomValues(new Uint8Array(16)));
    await inner.set(SALT_KEY, salt);
  }
  const material = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey'],
  );
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: Uint8Array.from(fromBase64(salt)), iterations: ITERATIONS },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );

  // The storage key is authenticated, so values cannot be swapped around.
  const aad = (name: string) => new TextEncoder().encode(name);
  const set = async (name: string, value: string) => {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const data = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData: aad(name) }, key, new TextEncoder().encode(value),
    );
    await inner.set(name, `${PREFIX}${toBase64(iv)}:${toBase64(new Uint8Array(data))}`);
  };
  const get = async (name: string): Promise<string | null> => {
    const stored = await inner.get(name);
    if (stored === null) return null;
    if (!stored.startsWith(PREFIX)) {
      await set(name, stored);
      return stored;
    }
    const [iv, data] = stored.slice(PREFIX.length).split(':').map((v) => Uint8Array.from(fromBase64(v)));
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv, additionalData: aad(name) }, key, data,
    );
    return new TextDecoder().decode(plain);
  };

  if (await hasEncryptedStorage(inner)) {
    const check = await get(CHECK_KEY).catch(() => null);
    if (check !== CHECK_VALUE) throw new WrongPasswordError();
  } else {
    await set(CHECK_KEY, CHECK_VALUE);
  }
  return { get, set, remove: (name) => inner.remove(name), encrypted: true };
}
