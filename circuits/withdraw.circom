/*
 * Withdraw: spends one note from a fixed-denomination shielded pool.
 *
 * Proves knowledge of `secret` such that
 *   commitment = Poseidon([secret, 1]) is a leaf of the tree with root `root`
 *   nullifier  = Poseidon([secret, 0])
 * The proof is bound to `recipient`, so it cannot be redirected.
 *
 * Public signals, in order: [ nullifier, root, recipient ]
 */
pragma circom 2.1.6;

include "circomlib/circuits/poseidon.circom";

template Withdraw(levels) {
  signal input root;
  signal input recipient;
  signal input secret;
  signal input siblings[levels];
  signal input positions[levels]; // 1 when the running hash is the right child

  signal output nullifier;

  component nullifierHash = Poseidon(2);
  nullifierHash.inputs[0] <== secret;
  nullifierHash.inputs[1] <== 0;
  nullifier <== nullifierHash.out;

  component commitmentHash = Poseidon(2);
  commitmentHash.inputs[0] <== secret;
  commitmentHash.inputs[1] <== 1;

  component hashes[levels];
  signal nodes[levels + 1];
  signal swaps[levels];
  nodes[0] <== commitmentHash.out;
  for (var i = 0; i < levels; i++) {
    positions[i] * (positions[i] - 1) === 0;
    swaps[i] <== positions[i] * (siblings[i] - nodes[i]);
    hashes[i] = Poseidon(2);
    hashes[i].inputs[0] <== nodes[i] + swaps[i];
    hashes[i].inputs[1] <== siblings[i] - swaps[i];
    nodes[i + 1] <== hashes[i].out;
  }
  root === nodes[levels];

  // Keeps `recipient` in the constraint system.
  signal recipientSquare;
  recipientSquare <== recipient * recipient;
}

component main { public [root, recipient] } = Withdraw(20);
