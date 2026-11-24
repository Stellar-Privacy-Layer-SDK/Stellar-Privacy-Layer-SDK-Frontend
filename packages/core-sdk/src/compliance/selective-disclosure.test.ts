import { Keypair } from '@stellar/stellar-sdk';
import { beforeEach, describe, expect, it } from 'vitest';
import { SelectiveDisclosure } from './selective-disclosure.js';
import { ViewingKeyManager } from './viewing-keys.js';
import { createMemoryStorageProvider } from '../utils/storage.js';
import type { ShieldedTransaction } from '../types.js';

const tx = (txHash = 'tx1'): ShieldedTransaction => ({
  type: 'withdrawal',
  txHash,
  commitmentHash: '0x1',
  nullifier: '0x2',
  amount: '100',
  token: 'C',
  recipient: 'GDEST',
  timestamp: 1,
  status: 'confirmed',
});

describe('SelectiveDisclosure', () => {
  const regulator = Keypair.random().publicKey();
  let keys: ViewingKeyManager;
  let sd: SelectiveDisclosure;

  beforeEach(() => {
    keys = new ViewingKeyManager(createMemoryStorageProvider());
    sd = new SelectiveDisclosure(keys);
  });

  it.each([
    ['full', '100', 'GDEST'],
    ['amount-only', '100', undefined],
    ['recipient-only', undefined, 'GDEST'],
  ] as const)('limits %s disclosures and signs them', async (scope, amount, recipient) => {
    const { payloads } = await sd.disclose([tx()], regulator, scope);
    expect(payloads[0]).toMatchObject({ scope, transactionHash: 'tx1' });
    expect(payloads[0].amount).toBe(amount);
    expect(payloads[0].recipient).toBe(recipient);
    expect(await sd.verify(payloads[0], payloads[0].signerPublicKey!)).toBe(true);
  });

  it('rejects tampering and unexpected signers', async () => {
    const { payloads: [payload] } = await sd.disclose([tx()], regulator);
    expect(await sd.verify({ ...payload, amount: '1' }, payload.signerPublicKey!)).toBe(false);
    expect(await sd.verify(payload, 'other')).toBe(false);
  });

  it('reuses the viewing key of the same scope', async () => {
    await sd.disclose([tx()], regulator);
    await sd.disclose([tx('tx2')], regulator);
    expect(keys.getAllViewingKeys()).toHaveLength(1);
    await sd.disclose([tx()], regulator, 'amount-only');
    expect(keys.getAllViewingKeys()).toHaveLength(2);
    expect(sd.getPayload('tx2')?.transactionHash).toBe('tx2');
  });
});
