import type { ProverArtifacts } from './prover';

/**
 * Standard URL layout for hosted Groth16 circuit artifacts. Point
 * `VITE_ZK_ARTIFACTS_URL` at a directory containing these files (e.g. a
 * GitHub Release or CDN) and `resolveArtifactUrls` produces the expected paths.
 *
 * The filenames match what `scripts/build-circuits.sh` outputs.
 */
export interface CircuitArtifactUrls {
  wasm: string;
  zkey: string;
  vkey: string;
}

/** Returns the standard artifact URLs for a base URL/directory. */
export function resolveArtifactUrls(baseUrl: string): CircuitArtifactUrls {
  const base = baseUrl.replace(/\/+$/, '');
  return {
    wasm: `${base}/shielded_transfer.wasm`,
    zkey: `${base}/shielded_transfer_final.zkey`,
    vkey: `${base}/verification_key.json`,
  };
}

/** True when a string should be treated as a fetchable artifact reference. */
export function isArtifactUrl(value: unknown): boolean {
  if (typeof value !== 'string' || value.length === 0) return false;
  // `data:` URLs are deliberately excluded: Node's fetch (undici) does not
  // support them, so accepting them would create a path that fails outside
  // browsers. Use http(s) URLs or in-memory Uint8Arrays instead.
  return /^https?:\/\//i.test(value);
}

/** Fetches a binary circuit artifact (`.wasm` / `.zkey`) into a Uint8Array. */
export async function fetchArtifact(url: string): Promise<Uint8Array> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ZK artifact from ${url}: HTTP ${response.status}`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

/**
 * Fetches and parses a Groth16 verification key (`.json`), which snarkjs
 * accepts as a plain object in `groth16.verify`.
 */
export async function fetchVkeyJson(url: string): Promise<Record<string, unknown>> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ZK verification key from ${url}: HTTP ${response.status}`);
  }
  return (await response.json()) as Record<string, unknown>;
}

/**
 * Loads every artifact referenced by URL into memory. Values that are not
 * URLs (inline Uint8Arrays / non-URL strings) are returned untouched, which
 * makes the function safe to call on already-resolved artifact sets.
 */
export async function resolveArtifacts(artifacts: ProverArtifacts): Promise<ProverArtifacts> {
  const wasm =
    typeof artifacts.wasm === 'string' && isArtifactUrl(artifacts.wasm)
      ? await fetchArtifact(artifacts.wasm)
      : artifacts.wasm;
  const zkey =
    typeof artifacts.zkey === 'string' && isArtifactUrl(artifacts.zkey)
      ? await fetchArtifact(artifacts.zkey)
      : artifacts.zkey;
  const vkey =
    typeof artifacts.vkey === 'string' && isArtifactUrl(artifacts.vkey)
      ? await fetchVkeyJson(artifacts.vkey)
      : artifacts.vkey;
  return { wasm, zkey, vkey };
}
