/*
 * ShieldedTransfer — Groth16 circuit for the Stellar Privacy Layer.
 *
 * Proves knowledge of `senderSecret` such that:
 *   commitment = Poseidon([senderSecret, recipientHash, amount, tokenHash])
 *   nullifier  = Poseidon([senderSecret, 0])
 * and that `commitment` is a member of the given Merkle tree `merkleRoot`.
 *
 * Public signals (in order, as produced by snarkjs):
 *   [ merkleRoot, commitmentOut, nullifierOut ]
 *
 * The SDK's SnarkjsProver reads the final two signals as the proven
 * commitment and nullifier, keeping them in sync with what gets committed
 * on-chain.
 *
 * Compile with `scripts/build-circuits.sh` (requires circom + snarkjs).
 */
pragma circom 2.1.6;

include "circomlib/circuits/poseidon.circom";

template MerkleLevel() {
  signal input left;
  signal input right;
  signal output out;

  component h = Poseidon(2);
  h.inputs[0] <== left;
  h.inputs[1] <== right;
  out <== h.out;
}

template ShieldedTransfer(nLevels) {
  signal private input senderSecret;
  signal private input recipientHash;
  signal private input amount;
  signal private input tokenHash;
  signal private input commitment;
  signal private input nullifier;

  signal input merkleRoot;
  signal private input merklePath[nLevels];

  signal output commitmentOut;
  signal output nullifierOut;

  // commitment === Poseidon([senderSecret, recipientHash, amount, tokenHash])
  component commitmentPoseidon = Poseidon(4);
  commitmentPoseidon.inputs[0] <== senderSecret;
  commitmentPoseidon.inputs[1] <== recipientHash;
  commitmentPoseidon.inputs[2] <== amount;
  commitmentPoseidon.inputs[3] <== tokenHash;
  commitmentOut <== commitmentPoseidon.out;
  commitment === commitmentOut;

  // nullifier === Poseidon([senderSecret, 0])
  component nullifierPoseidon = Poseidon(2);
  nullifierPoseidon.inputs[0] <== senderSecret;
  nullifierPoseidon.inputs[1] <== 0;
  nullifierOut <== nullifierPoseidon.out;
  nullifier === nullifierOut;

  // Merkle membership: walk `merklePath` from the commitment to the root.
  signal current <== commitment;
  for (var i = 0; i < nLevels; i++) {
    component level = MerkleLevel();
    level.left <== current;
    level.right <== merklePath[i];
    current <== level.out;
  }
  current === merkleRoot;
}

component main { public [merkleRoot] } = ShieldedTransfer(32);
