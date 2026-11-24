import { poseidonHash2 } from './crypto.js';

/** Depth of the pool contract's tree. */
export const TREE_LEVELS = 20;

export interface MerkleProof {
  root: string;
  siblings: string[];
  /** 1 when the running hash is the right child at that level. */
  positions: (0 | 1)[];
}

/** Builds the proof for `leaves[index]` in the contract's fixed-depth tree. */
export async function buildMerkleProof(leaves: string[], index: number): Promise<MerkleProof> {
  if (!Number.isInteger(index) || index < 0 || index >= leaves.length) {
    throw new Error('Merkle leaf index out of range');
  }
  const siblings: string[] = [];
  const positions: (0 | 1)[] = [];
  let level = leaves;
  let current = index;
  let zero = '0x' + '0'.repeat(64);
  for (let depth = 0; depth < TREE_LEVELS; depth++) {
    const isRight = current % 2 === 1;
    siblings.push(level[isRight ? current - 1 : current + 1] ?? zero);
    positions.push(isRight ? 1 : 0);
    const next: string[] = [];
    for (let i = 0; i < level.length; i += 2) {
      next.push(await poseidonHash2(level[i], level[i + 1] ?? zero));
    }
    level = next;
    current = Math.floor(current / 2);
    zero = await poseidonHash2(zero, zero);
  }
  return { root: level[0], siblings, positions };
}
