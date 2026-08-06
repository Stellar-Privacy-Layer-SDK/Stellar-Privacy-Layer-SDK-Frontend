#!/usr/bin/env bash
#
# build-circuits.sh — generate Groth16 artifacts for the shielded-transfer circuit.
#
# Produces (in ./artifacts):
#   shielded_transfer.wasm           — circuit wasm (for fullProve)
#   shielded_transfer_final.zkey     — proving key (for fullProve)
#   verification_key.json            — verification key (for groth16.verify)
#
# These files can be hosted on a CDN / GitHub Release and pointed to via the
# `VITE_ZK_ARTIFACTS_URL` dApp env var (see packages/dapp/src/env.ts).
#
# Prerequisites:
#   - Node.js >= 22 and npm
#   - circom 2.1.x   (https://docs.circom.io/getting-started/installation/)
#   - snarkjs 0.7.x  (npm i -g snarkjs)
#
# ⚠️ SECURITY: the Powers-of-Tau phase-1 below uses a deterministic "random"
# beacon for development/testing. For mainnet you MUST participate in (or reuse
# output from) a public trusted-setup ceremony. Never trust ad-hoc ceremony
# parameters for real assets.
#
# Usage:
#   ./scripts/build-circuits.sh          # full build (ceremony included)
#   ./scripts/build-circuits.sh --no-ceremony   # compile only, reuse existing .zkey

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CIRCUITS_DIR="$ROOT_DIR/circuits"
BUILD_DIR="$ROOT_DIR/build"
ARTIFACTS_DIR="$ROOT_DIR/artifacts"
NLEVELS=32

SKIP_CEREMONY=0
if [[ "${1:-}" == "--no-ceremony" ]]; then
  SKIP_CEREMONY=1
fi

command -v circom >/dev/null 2>&1 || { echo "error: circom not found — see https://docs.circom.io/getting-started/installation/"; exit 1; }
command -v snarkjs >/dev/null 2>&1 || { echo "error: snarkjs not found — run: npm i -g snarkjs"; exit 1; }

echo "→ Preparing directories"
mkdir -p "$BUILD_DIR" "$ARTIFACTS_DIR"

# circomlib (Poseidon) is a dev-time dependency for compilation only.
if [[ ! -d "$ROOT_DIR/node_modules/circomlib" ]]; then
  echo "→ Installing circomlib (dev dependency for circuit compilation)"
  (cd "$ROOT_DIR" && npm install --no-save --package-lock=false circomlib)
fi

echo "→ Compiling circuit (${NLEVELS} merkle levels)"
# -l makes circom resolve `include "circomlib/..."` from the repo-root node_modules.
circom "$CIRCUITS_DIR/shielded_transfer.circom" \
  --r1cs "$BUILD_DIR/shielded_transfer.r1cs" \
  --wasm "$BUILD_DIR/shielded_transfer.wasm" \
  --sym "$BUILD_DIR/shielded_transfer.sym" \
  -l "$ROOT_DIR/node_modules" \
  --output "$BUILD_DIR"

if [[ "$SKIP_CEREMONY" -eq 1 ]]; then
  echo "→ Skipping ceremony; reusing existing zkey (expected in $BUILD_DIR)"
else
  echo "→ Powers of Tau phase 1 (pot12, 12 = 2^12 constraints headroom)"
  snarkjs powersoftau new bn254 12 "$BUILD_DIR/pot12_0000.ptau" -v
  echo "5d41402abc4b2a76b9719d911017c592" | snarkjs powersoftau contribute "$BUILD_DIR/pot12_0000.ptau" "$BUILD_DIR/pot12_0001.ptau" --name="dev beacon" -v
  snarkjs powersoftau prepare phase2 "$BUILD_DIR/pot12_0001.ptau" "$BUILD_DIR/pot12_final.ptau" -v

  echo "→ Groth16 phase 2"
  snarkjs groth16 setup "$BUILD_DIR/shielded_transfer.r1cs" "$BUILD_DIR/pot12_final.ptau" "$BUILD_DIR/shielded_transfer_0000.zkey"
  echo "5d41402abc4b2a76b9719d911017c592" | snarkjs zkey contribute "$BUILD_DIR/shielded_transfer_0000.zkey" "$BUILD_DIR/shielded_transfer_0001.zkey" --name="dev beacon" -v
  snarkjs zkey verify "$BUILD_DIR/shielded_transfer.r1cs" "$BUILD_DIR/pot12_final.ptau" "$BUILD_DIR/shielded_transfer_0001.zkey"
  snarkjs zkey beacon "$BUILD_DIR/shielded_transfer_0001.zkey" "$BUILD_DIR/shielded_transfer_final.zkey" 0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20 10 -n="final beacon"
fi

echo "→ Exporting verification key"
snarkjs zkey export verificationkey "$BUILD_DIR/shielded_transfer_final.zkey" "$ARTIFACTS_DIR/verification_key.json"

echo "→ Copying proving artifacts"
cp "$BUILD_DIR/shielded_transfer.wasm" "$ARTIFACTS_DIR/shielded_transfer.wasm"
cp "$BUILD_DIR/shielded_transfer_final.zkey" "$ARTIFACTS_DIR/shielded_transfer_final.zkey"

echo ""
echo "✅ Artifacts written to $ARTIFACTS_DIR:"
ls -lh "$ARTIFACTS_DIR"
echo ""
echo "Next steps:"
echo "  1. Host these files at a stable URL (CDN or GitHub Release)."
echo "  2. Set VITE_ZK_ARTIFACTS_URL=<base-url> in your build environment."
echo "  3. The dApp will automatically use SnarkjsProver with real proofs."
