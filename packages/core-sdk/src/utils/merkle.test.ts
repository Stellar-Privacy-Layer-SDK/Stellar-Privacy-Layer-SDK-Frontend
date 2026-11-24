import { describe, expect, it } from 'vitest';
import { MerkleTree, TREE_LEVELS } from './merkle.js';
import { poseidonHash2 } from './crypto.js';

const leaf = (n: number) => '0x' + n.toString(16).padStart(64, '0');

const treeOf = async (leaves: string[]) => {
  const tree = new MerkleTree();
  for (const l of leaves) await tree.append(l);
  return tree;
};

describe('MerkleTree', () => {
  it.each([1, 2, 3, 5, 8])('proves every leaf of %i against one root', async (count) => {
    const leaves = Array.from({ length: count }, (_, i) => leaf(i + 1));
    const tree = await treeOf(leaves);
    const { root } = tree;
    for (let i = 0; i < count; i++) {
      const proof = tree.prove(i);
      expect(proof.siblings).toHaveLength(TREE_LEVELS);
      let node = leaves[i];
      for (let d = 0; d < TREE_LEVELS; d++) {
        node = proof.positions[d]
          ? await poseidonHash2(proof.siblings[d], node)
          : await poseidonHash2(node, proof.siblings[d]);
      }
      expect(node).toBe(root);
      expect(proof.root).toBe(root);
    }
  });

  it('matches the root computed by the contract', async () => {
    // Same three notes as packages/contract/src/fixture.rs.
    const leaves = await Promise.all([111, 222, 333].map((s) => poseidonHash2(leaf(s), leaf(1))));
    const { root } = await treeOf(leaves);
    expect(root).toBe('0x2011ba39be475de6242fc719ef6268be98d5831ee331220e239907508a2f4adf');
  });

  it('rejects an out-of-range index', async () => {
    const tree = await treeOf([leaf(1)]);
    expect(() => tree.prove(1)).toThrow('out of range');
  });
});
