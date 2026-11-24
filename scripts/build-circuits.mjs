/**
 * Compiles circuits/withdraw.circom and writes the Groth16 artifacts
 * (wasm, proving key, verification key) to ./artifacts.
 *
 * Phase 2 is a single local contribution. That is fine for testing; real
 * assets need a multi-party phase 2 ceremony.
 */
import { execFileSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as snarkjs from 'snarkjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const build = join(root, 'build');
const out = join(root, 'artifacts');
const PTAU_BLAKE2B =
  'eeefbcf7c3803b523c94112023c7ff89558f9b8e0cf5d6cdcba3ade60f168af4' +
  'a181c9c21774b94fbae6c90411995f7d854d02ebd93fb66043dbb06f17a831c1';

rmSync(build, { recursive: true, force: true });
mkdirSync(build, { recursive: true });
mkdirSync(out, { recursive: true });

execFileSync(
  process.execPath,
  [
    join(root, 'node_modules/circom2/cli.js'),
    'circuits/withdraw.circom',
    '--r1cs', '--wasm', '-l', 'node_modules', '-o', 'build',
  ],
  { cwd: root, stdio: 'inherit' },
);

const at = (name) => join(build, name);
const entropy = () => randomBytes(32).toString('hex');

// Phase 1 comes from the public Hermez ceremony, pinned by its published hash.
const ptau = join(root, '.cache', 'powersOfTau28_hez_final_14.ptau');
if (!existsSync(ptau)) {
  console.log('Downloading phase 1 parameters...');
  const response = await fetch('https://circom.info/powersOfTau28_hez_final_14.ptau');
  if (!response.ok) throw new Error(`Download failed: HTTP ${response.status}`);
  mkdirSync(dirname(ptau), { recursive: true });
  writeFileSync(ptau, Buffer.from(await response.arrayBuffer()));
}
const hash = createHash('blake2b512').update(readFileSync(ptau)).digest('hex');
if (hash !== PTAU_BLAKE2B) {
  rmSync(ptau);
  throw new Error('Phase 1 parameters do not match the expected hash');
}

console.log('Running phase 2...');
await snarkjs.zKey.newZKey(at('withdraw.r1cs'), ptau, at('z0.zkey'));
await snarkjs.zKey.contribute(at('z0.zkey'), join(out, 'withdraw_final.zkey'), 'local', entropy());

const vkey = await snarkjs.zKey.exportVerificationKey(join(out, 'withdraw_final.zkey'));
writeFileSync(join(out, 'verification_key.json'), JSON.stringify(vkey, null, 2));
copyFileSync(at('withdraw_js/withdraw.wasm'), join(out, 'withdraw.wasm'));
console.log(`Artifacts written to ${out}`);
process.exit(0);
