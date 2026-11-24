import { poseidonHash2 } from './crypto.js';

/** Depth of the pool contract's tree. */
export const TREE_LEVELS = 20;

export interface MerkleProof {
  root: string;
  siblings: string[];
  /** 1 when the running hash is the right child at that level. */
  positions: (0 | 1)[];
}

/** Append-only copy of the contract's tree; each append costs `TREE_LEVELS` hashes. */
export class MerkleTree {
  private levels: string[][] = Array.from({ length: TREE_LEVELS + 1 }, () => []);
  private zeros: string[] = [];

  get leaves(): readonly string[] {
    return this.levels[0];
  }

  private async init(): Promise<void> {
    let zero = '0x' + '0'.repeat(64);
    while (this.zeros.length <= TREE_LEVELS) {
      this.zeros.push(zero);
      zero = await poseidonHash2(zero, zero);
    }
  }

  async append(leaf: string): Promise<void> {
    if (this.zeros.length === 0) await this.init();
    let index = this.levels[0].push(leaf) - 1;
    for (let depth = 0; depth < TREE_LEVELS; depth++) {
      const left = index - (index % 2);
      const level = this.levels[depth];
      index = left / 2;
      this.levels[depth + 1][index] = await poseidonHash2(
        level[left],
        level[left + 1] ?? this.zeros[depth],
      );
    }
  }

  prove(index: number): MerkleProof {
    if (!Number.isInteger(index) || index < 0 || index >= this.leaves.length) {
      throw new Error('Merkle leaf index out of range');
    }
    const siblings: string[] = [];
    const positions: (0 | 1)[] = [];
    for (let depth = 0; depth < TREE_LEVELS; depth++) {
      const isRight = index % 2 === 1;
      siblings.push(this.levels[depth][isRight ? index - 1 : index + 1] ?? this.zeros[depth]);
      positions.push(isRight ? 1 : 0);
      index = Math.floor(index / 2);
    }
    return { root: this.root, siblings, positions };
  }

  get root(): string {
    return this.levels[TREE_LEVELS][0];
  }
}
