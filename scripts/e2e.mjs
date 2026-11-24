/**
 * Deploys a pool to a local Stellar network and runs deposit, withdrawal and a
 * double-spend attempt through the SDK.
 *
 *   docker run --rm -p 8000:8000 stellar/quickstart:latest --local --limits testnet
 *   npm run build:circuits && npm run build:contract && npm run build:sdk
 *   npm run test:e2e
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import {
  createMemoryStorageProvider, Network, PrivacySDK, resolveNetworkConfig, SnarkjsProver,
} from '../packages/core-sdk/dist/index.js';
import { connect } from './stellar.mjs';

const require = createRequire(new URL('../packages/core-sdk/package.json', import.meta.url));
const { Keypair, TransactionBuilder } = require('@stellar/stellar-sdk');
const path = (p) => new URL(`../${p}`, import.meta.url).pathname;
const WASM = process.env.POOL_WASM
  ?? path('packages/contract/target/wasm32v1-none/release/stellar_shielded_pool.wasm');
const base = resolveNetworkConfig(Network.SANDBOX);
const vkey = JSON.parse(readFileSync(path('artifacts/verification_key.json'), 'utf8'));
const chain = connect(base.rpcUrl, base.networkPassphrase);

const newAccount = async () => {
  const keypair = Keypair.random();
  const response = await fetch(`${base.horizonUrl}/friendbot?addr=${keypair.publicKey()}`);
  assert.ok(response.ok, 'friendbot failed');
  return keypair;
};
const newSdk = async (keypair, contractId) => {
  const sdk = new PrivacySDK({
    network: { ...base, contractId },
    storageProvider: createMemoryStorageProvider(),
    logLevel: 'error',
    prover: new SnarkjsProver({
      wasm: path('artifacts/withdraw.wasm'), zkey: path('artifacts/withdraw_final.zkey'), vkey,
    }),
    signer: async (xdr, passphrase) => {
      const tx = TransactionBuilder.fromXDR(xdr, passphrase);
      tx.sign(keypair);
      return tx.toXDR();
    },
  });
  await sdk.initialize();
  await sdk.client.connectWallet(keypair.publicKey(), Network.SANDBOX);
  return sdk;
};

const [depositor, relayer, recipient] = [await newAccount(), await newAccount(), await newAccount()];
await chain.ensureNativeToken(depositor);
const denomination = 100_0000000n;
const contractId = await chain.deployPool(depositor, {
  wasm: readFileSync(WASM), token: chain.nativeToken, denomination, vkey,
});
console.log('pool deployed', contractId);

const sdk = await newSdk(depositor, contractId);
for (let i = 0; i < 3; i++) await chain.wait((await sdk.pool.deposit()).txHash);
await sdk.pool.refresh();
assert.equal((await sdk.pool.getInfo()).depositCount, 3);
assert.ok(sdk.pool.getNotes().every((n) => n.status === 'available'));
console.log('3 deposits confirmed');

// A different account restores the backup and submits the withdrawal.
const { commitment } = sdk.pool.getNotes()[1];
const other = await newSdk(relayer, contractId);
await other.pool.importNote(sdk.pool.exportNote(commitment));
const before = Number(await other.client.getAccountBalance(recipient.publicKey()));
await chain.wait((await other.pool.withdraw(commitment, recipient.publicKey())).txHash);
const after = Number(await other.client.getAccountBalance(recipient.publicKey()));
assert.equal(after - before, 100);
console.log('withdrawal paid the recipient');

await assert.rejects(sdk.pool.withdraw(commitment, recipient.publicKey()), /simulation failed/);
await sdk.pool.refresh();
assert.equal(sdk.pool.getNotes().find((n) => n.commitment === commitment).status, 'spent');
console.log('double spend rejected');
process.exit(0);
