/**
 * Deploys a pool. Usage:
 *   DEPLOYER_SECRET=S... node scripts/deploy-pool.mjs <network> <denomination> [token]
 * `denomination` is in the token's smallest unit; `token` defaults to XLM.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { NETWORK_CONFIGS } from '../packages/core-sdk/dist/index.js';
import { connect } from './stellar.mjs';

const require = createRequire(new URL('../packages/core-sdk/package.json', import.meta.url));
const { Keypair } = require('@stellar/stellar-sdk');
const [network, denomination, token] = process.argv.slice(2);
const config = NETWORK_CONFIGS[network];
if (!config || !/^[1-9]\d*$/.test(denomination ?? '') || !process.env.DEPLOYER_SECRET) {
  console.error('Usage: DEPLOYER_SECRET=S... node scripts/deploy-pool.mjs <network> <denomination> [token]');
  process.exit(1);
}
if (network === 'public') {
  console.error('Refusing to deploy to the public network: the contract is unaudited and the proving key has no multi-party setup.');
  process.exit(1);
}
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url));
const chain = connect(config.rpcUrl, config.networkPassphrase);
const id = await chain.deployPool(Keypair.fromSecret(process.env.DEPLOYER_SECRET), {
  wasm: read('packages/contract/target/wasm32v1-none/release/stellar_shielded_pool.wasm'),
  token: token ?? chain.nativeToken,
  denomination,
  vkey: JSON.parse(read('artifacts/verification_key.json')),
});
console.log(`VITE_CONTRACT_ID=${id}`);
