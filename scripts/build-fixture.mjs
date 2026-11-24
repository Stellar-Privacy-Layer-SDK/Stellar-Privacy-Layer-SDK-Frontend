/** Generates packages/contract/src/fixture.rs: a proof for the third of three notes. */
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { deriveNote, encodeGroth16Proof, MerkleTree, payoutField, toHex } from '../packages/core-sdk/dist/index.js';
import { encodeVerificationKeyParts } from './stellar.mjs';

const require = createRequire(new URL('../packages/core-sdk/package.json', import.meta.url));
const snarkjs = require('snarkjs');
const path = (p) => new URL(`../${p}`, import.meta.url).pathname;
// Contract addresses, so that the test token needs no trustlines.
const RECIPIENT = 'CA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJUWDA';
const RELAYER = 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC';
const FEE = '5000000';

const tree = new MerkleTree();
const secrets = [111, 222, 333].map(String);
for (const secret of secrets) await tree.append((await deriveNote(secret)).commitment);
const { root, siblings, positions } = tree.prove(2);
const { proof, publicSignals } = await snarkjs.groth16.fullProve(
  { root, siblings, positions, secret: secrets[2], recipient: payoutField(RECIPIENT, RELAYER, FEE) },
  path('artifacts/withdraw.wasm'),
  path('artifacts/withdraw_final.zkey'),
);
const vkey = JSON.parse(readFileSync(path('artifacts/verification_key.json'), 'utf8'));
const { a, b, c } = encodeGroth16Proof(proof);
const key = encodeVerificationKeyParts(vkey);
const values = {
  A: a, B: b, C: c,
  ALPHA: key.alpha_g1, BETA: key.beta_g2, GAMMA: key.gamma_g2, DELTA: key.delta_g2,
  ...Object.fromEntries(key.ic.map((point, i) => [`IC${i}`, point])),
  ...Object.fromEntries(tree.leaves.map((leaf, i) => [`LEAF${i}`, leaf])),
  NULLIFIER: '0x' + BigInt(publicSignals[0]).toString(16).padStart(64, '0'),
  ROOT: root,
};
let out = `//! A withdrawal proof for the third of three notes, with its verification key,
//! hex-encoded in the contract's wire format. Run \`npm run build:fixture\`.

pub const RECIPIENT: &str = "${RECIPIENT}";
pub const RELAYER: &str = "${RELAYER}";
`;
for (const [name, value] of Object.entries(values)) {
  const hex = typeof value === 'string' ? value.slice(2) : toHex(value);
  const lines = hex.match(/.{64}/g).map((line) => `    "${line}",\n`).join('');
  out += `\npub const ${name}: &str = concat!(\n${lines});\n`;
}
writeFileSync(path('packages/contract/src/fixture.rs'), out);
process.exit(0);
