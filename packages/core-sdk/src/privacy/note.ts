import { poseidonHash } from '../utils/crypto.js';
import type { Network } from '../types.js';

/**
 * `spending` and `unconfirmed` are settled by `ShieldedPool.refresh()`. A
 * `failed` note never reached the pool; its secret is kept just in case.
 */
export type NoteStatus = 'unconfirmed' | 'failed' | 'available' | 'spending' | 'spent';

/** A deposit that can be withdrawn by whoever knows `secret`. */
export interface Note {
  secret: string;
  commitment: string;
  nullifier: string;
  network: Network;
  contractId: string;
  token: string;
  /** Amount in whole token units. */
  amount: string;
  status: NoteStatus;
  timestamp: number;
}

export async function deriveNote(secret: string): Promise<{ commitment: string; nullifier: string }> {
  return {
    commitment: await poseidonHash([secret, 1]),
    nullifier: await poseidonHash([secret, 0]),
  };
}

const PREFIX = 'spl-note-v1';

/** Serializes a note for backup. Anyone holding this string can spend it. */
export function encodeNote(note: Pick<Note, 'network' | 'contractId' | 'secret'>): string {
  return [PREFIX, note.network, note.contractId, note.secret].join(':');
}

export function decodeNote(text: string): { network: string; contractId: string; secret: string } {
  const [prefix, network, contractId, secret, ...rest] = text.trim().split(':');
  if (prefix !== PREFIX || rest.length > 0 || !/^0x[0-9a-f]{64}$/.test(secret ?? '')) {
    throw new Error('Invalid note');
  }
  return { network, contractId, secret };
}
