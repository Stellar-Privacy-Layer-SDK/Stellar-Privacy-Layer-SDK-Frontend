import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  resolveArtifactUrls,
  isArtifactUrl,
  fetchArtifact,
  fetchVkeyJson,
  resolveArtifacts,
} from './artifacts.js';

describe('resolveArtifactUrls', () => {
  it('builds standard artifact URLs from a base URL', () => {
    expect(resolveArtifactUrls('https://cdn.example.com/artifacts/')).toEqual({
      wasm: 'https://cdn.example.com/artifacts/withdraw.wasm',
      zkey: 'https://cdn.example.com/artifacts/withdraw_final.zkey',
      vkey: 'https://cdn.example.com/artifacts/verification_key.json',
    });
  });

  it('handles base URLs without trailing slashes', () => {
    expect(resolveArtifactUrls('https://cdn.example.com/artifacts').wasm).toBe(
      'https://cdn.example.com/artifacts/withdraw.wasm',
    );
  });
});

describe('isArtifactUrl', () => {
  it('detects http(s) URLs', () => {
    expect(isArtifactUrl('https://example.com/a.wasm')).toBe(true);
    expect(isArtifactUrl('http://example.com/a.zkey')).toBe(true);
  });

  it('rejects local paths, data URLs, and bare strings', () => {
    expect(isArtifactUrl('wasm_data')).toBe(false);
    expect(isArtifactUrl('/tmp/artifacts/a.wasm')).toBe(false);
    expect(isArtifactUrl('data:application/octet-stream;base64,AAAA')).toBe(false);
    expect(isArtifactUrl('')).toBe(false);
  });
});

describe('fetchArtifact', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetches binary artifacts into a Uint8Array', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(bytes.buffer),
    }));

    const result = await fetchArtifact('https://example.com/circuit.wasm');
    expect(result).toBeInstanceOf(Uint8Array);
    expect([...result]).toEqual([1, 2, 3, 4]);
  });

  it('throws on HTTP errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
    }));

    await expect(fetchArtifact('https://example.com/missing.wasm')).rejects.toThrow(
      'HTTP 404',
    );
  });
});

describe('fetchVkeyJson', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('parses the verification key JSON', async () => {
    const vkey = { vk_alpha_1: 'abc', protocol: 'groth16' };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(vkey),
    }));

    await expect(fetchVkeyJson('https://example.com/vkey.json')).resolves.toEqual(vkey);
  });

  it('throws on HTTP errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    }));

    await expect(fetchVkeyJson('https://example.com/vkey.json')).rejects.toThrow(
      'HTTP 500',
    );
  });
});

describe('resolveArtifacts', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('resolves URL artifacts and passes through inline values', async () => {
    const wasmBytes = new Uint8Array([9]);
    const zkeyBytes = new Uint8Array([8]);
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
      if (url.endsWith('.wasm')) {
        return Promise.resolve({ ok: true, arrayBuffer: () => Promise.resolve(wasmBytes.buffer) });
      }
      if (url.endsWith('.zkey')) {
        return Promise.resolve({ ok: true, arrayBuffer: () => Promise.resolve(zkeyBytes.buffer) });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ vk_alpha_1: 'xyz' }),
      });
    }));

    const resolved = await resolveArtifacts({
      wasm: 'https://cdn.example.com/withdraw.wasm',
      zkey: 'https://cdn.example.com/withdraw_final.zkey',
      vkey: 'https://cdn.example.com/verification_key.json',
    });

    expect([...resolved.wasm as Uint8Array]).toEqual([9]);
    expect([...resolved.zkey as Uint8Array]).toEqual([8]);
    expect(resolved.vkey).toEqual({ vk_alpha_1: 'xyz' });
  });

  it('leaves non-URL values untouched', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const resolved = await resolveArtifacts({
      wasm: new Uint8Array([1]),
      zkey: 'local/path.zkey',
      vkey: { vk: 'object' },
    });

    expect(resolved.wasm).toEqual(new Uint8Array([1]));
    expect(resolved.zkey).toBe('local/path.zkey');
    expect(resolved.vkey).toEqual({ vk: 'object' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
