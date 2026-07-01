export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

export function fromHex(hex: string): Uint8Array {
  const cleaned = hex.startsWith('0x') ? hex.slice(2) : hex;
  const bytes = new Uint8Array(Math.ceil(cleaned.length / 2));
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(cleaned.substr(i * 2, 2), 16);
  }
  return bytes;
}

export function toBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

export function fromBase64(base64: string): Uint8Array {
  return Uint8Array.from(atob(base64), c => c.charCodeAt(0));
}

export function truncateAddress(address: string, chars: number = 6): string {
  return `${address.slice(0, chars)}...${address.slice(-4)}`;
}

export function formatUnits(amount: string, decimals: number): string {
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

export function isValidPublicKey(key: string): boolean {
  return /^G[A-Z0-9]{55}$/.test(key);
}

export function isValidAmount(amount: string): boolean {
  const num = parseFloat(amount);
  return !isNaN(num) && num > 0 && num <= 9999999999;
}
