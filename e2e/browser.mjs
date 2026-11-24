/**
 * Drives the built dApp in Chromium against a local network: password, deposit,
 * reload, and a relayed withdrawal with an in-browser proof. Freighter is
 * replaced by a stub that signs with a test key.
 *
 *   npx playwright install chromium
 *   npm run test:browser      (after the steps in e2e/sdk.mjs)
 */
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { extname, join } from 'node:path';
import { chromium } from 'playwright';
import { Network, resolveNetworkConfig } from '../packages/core-sdk/dist/index.js';
import { connect } from '../scripts/stellar.mjs';

const require = createRequire(new URL('../packages/core-sdk/package.json', import.meta.url));
const { Keypair, TransactionBuilder } = require('@stellar/stellar-sdk');
const path = (p) => new URL(`../${p}`, import.meta.url).pathname;
const WASM = process.env.POOL_WASM
  ?? path('packages/contract/target/wasm32v1-none/release/stellar_shielded_pool.wasm');
const config = resolveNetworkConfig(Network.SANDBOX);
const chain = connect(config.rpcUrl, config.networkPassphrase);
const fund = async () => {
  const keypair = Keypair.random();
  assert.ok((await fetch(`${config.horizonUrl}/friendbot?addr=${keypair.publicKey()}`)).ok);
  return keypair;
};
const balance = async (address) => {
  const { balances } = await (await fetch(`${config.horizonUrl}/accounts/${address}`)).json();
  return Number(balances.find((b) => b.asset_type === 'native').balance);
};

const [user, relayer, recipient] = [await fund(), await fund(), await fund()];
await chain.ensureNativeToken(user);
const contractId = await chain.deployPool(user, {
  wasm: readFileSync(WASM),
  token: chain.nativeToken,
  denomination: 100_0000000n,
  vkey: JSON.parse(readFileSync(path('artifacts/verification_key.json'), 'utf8')),
});
console.log('pool deployed');

const relayerProcess = spawn(process.execPath, [path('packages/relayer/main.mjs')], {
  env: { ...process.env, RELAYER_SECRET: relayer.secret(), CONTRACT_ID: contractId, NETWORK: 'sandbox', PORT: '8787' },
  stdio: 'inherit',
});
execFileSync('npm', ['run', '-s', 'build:dapp'], {
  cwd: path(''),
  stdio: ['ignore', 'ignore', 'inherit'],
  env: {
    ...process.env,
    VITE_STELLAR_NETWORK: 'sandbox',
    VITE_CONTRACT_ID: contractId,
    VITE_ZK_ARTIFACTS_URL: 'http://localhost:4173/artifacts',
    VITE_RELAYER_URL: 'http://localhost:8787',
  },
});
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.wasm': 'application/wasm' };
const site = createServer((req, res) => {
  const name = new URL(req.url, 'http://x').pathname;
  const file = name.startsWith('/artifacts/')
    ? join(path('artifacts'), name.slice(11))
    : join(path('packages/dapp/dist'), name);
  const target = extname(name) && existsSync(file) ? file : path('packages/dapp/dist/index.html');
  res.writeHead(200, { 'content-type': types[extname(target)] ?? 'application/octet-stream' });
  res.end(readFileSync(target));
}).listen(4173);

const browser = await chromium.launch();
let code = 1;
const page = await browser.newPage();
try {
  page.on('pageerror', (e) => console.error('page error:', e.message));
  page.on('console', (m) => m.type() === 'error' && console.error('console:', m.text()));
  let signatures = 0;
  await page.exposeFunction('testSign', (xdr) => {
    signatures++;
    const tx = TransactionBuilder.fromXDR(xdr, config.networkPassphrase);
    tx.sign(user);
    return tx.toXDR();
  });
  await page.addInitScript((address) => {
    window.stellar = {
      freighter: {
        isConnected: async () => ({ isConnected: true }),
        getAddress: async () => ({ address }),
        getNetwork: async () => ({ network: 'STANDALONE', networkPassphrase: '' }),
        signTransaction: (xdr) => window.testSign(xdr),
      },
    };
  }, user.publicKey());
  const go = (label) => page.getByRole('link', { name: label, exact: true }).click();
  const connectWallet = () => page.getByRole('button', { name: /connect/i }).first().click();

  await page.goto('http://localhost:4173/');
  await page.getByLabel('Password', { exact: true }).fill('correct horse battery');
  await page.getByLabel('Confirm password').fill('correct horse battery');
  await page.getByRole('button', { name: 'Continue' }).click();
  await connectWallet();
  await go('Deposit');
  await page.getByRole('button', { name: 'Deposit', exact: true }).click();
  await page.getByText('Back up your note').waitFor({ timeout: 30_000 });
  assert.equal(signatures, 1);
  console.log('deposited');

  const stored = await page.evaluate(() => JSON.stringify(localStorage));
  assert.ok(!stored.includes('"secret') && !stored.includes('secret\\"'), 'plaintext in storage');
  await new Promise((resolve) => setTimeout(resolve, 8000));

  await page.reload();
  await page.getByLabel('Password', { exact: true }).fill('wrong password');
  await page.getByRole('button', { name: 'Unlock' }).click();
  await page.getByText('Wrong password').waitFor();
  await page.getByLabel('Password', { exact: true }).fill('correct horse battery');
  await page.getByRole('button', { name: 'Unlock' }).click();
  await connectWallet();
  console.log('unlocked after reload');

  const before = await balance(recipient.publicKey());
  await go('Withdraw');
  await page.getByRole('radio').check();
  await page.getByLabel('Recipient (G...)').fill(recipient.publicKey());
  await page.getByRole('button', { name: 'Withdraw', exact: true }).click();
  await page.getByText('Transaction History').waitFor({ timeout: 90_000 });
  assert.equal((await balance(recipient.publicKey())) - before, 100);
  assert.equal(signatures, 1, 'the user wallet must not sign the withdrawal');
  console.log('relayed withdrawal paid the recipient');
  await page.getByText('Confirmed').nth(1).waitFor({ timeout: 30_000 });
  console.log('history settled');
  code = 0;
} catch (error) {
  console.error(error);
  console.error(await page.locator('body').innerText().catch(() => ''));
  await page.screenshot({ path: path('build/e2e-failure.png') }).catch(() => {});
} finally {
  await browser.close();
  relayerProcess.kill();
  site.close();
}
process.exit(code);
