import { StrKey } from '@stellar/stellar-sdk';

const BASE64_CHUNK = 0x8000;

export function toHex(bytes: Uint8Array): string {
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}

export function fromHex(hex: string): Uint8Array {
  let cleaned = hex.startsWith('0x') ? hex.slice(2) : hex;
  // Normalize odd-length hex by left-padding with a zero nibble.
  if (cleaned.length % 2 !== 0) cleaned = '0' + cleaned;
  const bytes = new Uint8Array(cleaned.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(cleaned.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

export function toBase64(bytes: Uint8Array): string {
  // Chunked conversion avoids call-stack overflow on large inputs.
  let binary = '';
  for (let i = 0; i < bytes.length; i += BASE64_CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + BASE64_CHUNK));
  }
  return btoa(binary);
}

export function fromBase64(base64: string): Uint8Array {
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

export function truncateAddress(address: string, chars: number = 6): string {
  if (address.length <= chars + 5) return address;
  return `${address.slice(0, chars)}...${address.slice(-4)}`;
}

export function formatUnits(amount: string, decimals: number): string {
  if (decimals === 0) return amount;
  const padded = amount.padStart(decimals + 1, '0');
  const integerPart = padded.slice(0, -decimals) || '0';
  const fractionalPart = padded.slice(-decimals);
  return `${integerPart}.${fractionalPart}`;
}

export function parseUnits(amount: string, decimals: number): string {
  const [integer, fractional = ''] = amount.split('.');
  const padded = fractional.padEnd(decimals, '0').slice(0, decimals);
  return `${integer}${padded}`.replace(/^0+/, '') || '0';
}

export function sanitizeMemo(memo: string): string {
  return memo.replace(/[^a-zA-Z0-9\s\-_.]/g, '').slice(0, 28);
}

/**
 * Validates a Stellar public key using the StrKey checksum algorithm
 * (industry standard) instead of a loose regex.
 */
export function isValidPublicKey(key: string): boolean {
  try {
    return StrKey.isValidEd25519PublicKey(key);
  } catch {
    return false;
  }
}

export function isValidAmount(amount: string): boolean {
  if (typeof amount !== 'string' || amount.length === 0) return false;
  if (!/^\d+(\.\d+)?$/.test(amount)) return false;
  const num = parseFloat(amount);
  return !isNaN(num) && num > 0 && num <= 9999999999;
}
