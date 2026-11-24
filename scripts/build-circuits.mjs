/**
 * Compiles circuits/shielded_transfer.circom and writes the Groth16 artifacts
 * (wasm, proving key, verification key) to ./artifacts.
 *
 * The trusted setup is a single local contribution with random entropy. That
 * is fine for testing; real assets need a public multi-party ceremony.
 */
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { copyFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as snarkjs from 'snarkjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const build = join(root, 'build');
const out = join(root, 'artifacts');
const POWER = 12; // up to 2^12 constraints

rmSync(build, { recursive: true, force: true });
mkdirSync(build, { recursive: true });
mkdirSync(out, { recursive: true });

execFileSync(
  process.execPath,
  [
    join(root, 'node_modules/circom2/cli.js'),
    'circuits/shielded_transfer.circom',
    '--r1cs', '--wasm', '-l', 'node_modules', '-o', 'build',
  ],
  { cwd: root, stdio: 'inherit' },
);

const at = (name) => join(build, name);
const entropy = () => randomBytes(32).toString('hex');
const curve = await snarkjs.curves.getCurveFromName('bn128');

console.log('Running local trusted setup...');
await snarkjs.powersOfTau.newAccumulator(curve, POWER, at('pot0.ptau'));
await snarkjs.powersOfTau.contribute(at('pot0.ptau'), at('pot1.ptau'), 'local', entropy());
await snarkjs.powersOfTau.preparePhase2(at('pot1.ptau'), at('pot.ptau'));
await snarkjs.zKey.newZKey(at('shielded_transfer.r1cs'), at('pot.ptau'), at('z0.zkey'));
await snarkjs.zKey.contribute(at('z0.zkey'), join(out, 'shielded_transfer_final.zkey'), 'local', entropy());

const vkey = await snarkjs.zKey.exportVerificationKey(join(out, 'shielded_transfer_final.zkey'));
writeFileSync(join(out, 'verification_key.json'), JSON.stringify(vkey, null, 2));
copyFileSync(at('shielded_transfer_js/shielded_transfer.wasm'), join(out, 'shielded_transfer.wasm'));
console.log(`Artifacts written to ${out}`);
await curve.terminate();
process.exit(0);
