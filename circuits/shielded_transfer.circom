/*
 * ShieldedDeposit: Groth16 circuit for creating a shielded commitment.
 *
 * Proves knowledge of `senderSecret` such that:
 *   commitment = H([senderSecret, recipient, amount, token])
 *   nullifier  = H([senderSecret, 0])
 *
 * H is the SDK's `poseidonHash`: a width-3 Poseidon permutation absorbing two
 * elements at a time, with the previous output carried in state[0].
 *
 * Public signals (in order, as produced by snarkjs): [ commitment, nullifier ]
 *
 * Membership (withdrawal) is a separate statement and is not proven here.
 */
pragma circom 2.1.6;

include "circomlib/circuits/poseidon.circom";

template ShieldedDeposit() {
  signal input senderSecret;
  signal input recipient;
  signal input amount;
  signal input token;

  signal output commitment;
  signal output nullifier;

  component first = PoseidonEx(2, 1);
  first.initialState <== 0;
  first.inputs[0] <== senderSecret;
  first.inputs[1] <== recipient;

  component second = PoseidonEx(2, 1);
  second.initialState <== first.out[0];
  second.inputs[0] <== amount;
  second.inputs[1] <== token;
  commitment <== second.out[0];

  component nullifierHash = Poseidon(2);
  nullifierHash.inputs[0] <== senderSecret;
  nullifierHash.inputs[1] <== 0;
  nullifier <== nullifierHash.out;
}

component main = ShieldedDeposit();
