# Stellar Privacy Layer

A fixed-denomination shielded pool for Stellar: a Soroban contract, a TypeScript
SDK and a reference dApp.

> Experimental and unaudited. Do not use with real assets.

## How it works

1. **Deposit** sends one fixed amount of a token to the pool with a commitment,
   `Poseidon(secret, 1)`, which the contract adds to an on-chain Merkle tree.
2. **Withdraw** proves in zero knowledge that you know the secret of *some*
   commitment, and reveals `Poseidon(secret, 0)` so it can be spent only once.
3. The proof is bound to the recipient, so any account may submit it. Observers
   see a deposit and a withdrawal but not which deposit was withdrawn.

```
circuits/           withdraw.circom (Groth16, BN254, tree depth 20)
packages/contract/  Soroban pool: tree, proof verification, token custody; no admin
packages/core-sdk/  SDK: notes, proving, contract client, viewing keys, disclosure
packages/dapp/      React dApp (Freighter)
scripts/            circuit build, pool deployment, end-to-end test
```

## Quick start

Needs Node.js >= 22.12; Rust with the `wasm32v1-none` target for the contract.

```bash
npm install
npm run build:circuits     # proving artifacts -> ./artifacts
npm run dev                # dApp at http://localhost:3000
npm run verify             # lint, types, tests with coverage, build
(cd packages/contract && cargo test)
```

### End-to-end test

Runs deposits, a withdrawal from another account and a double-spend attempt
against a local network:

```bash
docker run --rm -d -p 8000:8000 stellar/quickstart:latest --local --limits testnet
npm run build:contract && npm run build:sdk && npm run test:e2e
```

### Deploy a pool

```bash
DEPLOYER_SECRET=S... npm run deploy:pool -- testnet 1000000000   # 100 XLM
```

Then host `./artifacts` and set the dApp variables. The artifacts must be the
ones the pool was deployed with.

| Variable                | Purpose                                           |
| ----------------------- | ------------------------------------------------- |
| `VITE_STELLAR_NETWORK`  | `public`, `testnet` (default), `futurenet`, `sandbox` |
| `VITE_CONTRACT_ID`      | Pool contract ID                                  |
| `VITE_ZK_ARTIFACTS_URL` | Base URL of the artifacts; required to withdraw   |
| `VITE_SOROBAN_RPC_URL`, `VITE_HORIZON_URL` | Endpoint overrides             |
| `VITE_DEBUG`            | `true` for verbose logs                           |

## SDK

```ts
import { PrivacySDK, SnarkjsProver, resolveArtifactUrls } from '@stellar-privacy/sdk';

const sdk = new PrivacySDK({
  network, // NetworkConfig including contractId
  prover: new SnarkjsProver(resolveArtifactUrls('https://example.com/artifacts')),
});
await sdk.initialize();
const wallet = await sdk.wallet.connect();
await sdk.client.connectWallet(wallet.publicKey, wallet.network);

const { note } = await sdk.pool.deposit();
const backup = sdk.pool.exportNote(note.commitment);
await sdk.pool.refresh();
await sdk.pool.withdraw(note.commitment, 'G...recipient');
```

Pass `signer` to sign without Freighter, for example in Node.

## Security and limitations

- **Not audited.** Phase 1 of the trusted setup is the public Hermez ceremony;
  phase 2 is a single local contribution, so whoever built the key could forge
  proofs. A multi-party phase 2 is needed, and `deploy:pool` refuses mainnet.
- **Anonymity depends on the pool.** Few deposits, or withdrawing soon after
  depositing, makes linking easy. There is no relayer service, so the account
  that submits a withdrawal and pays its fee is visible.
- **Note secrets are stored unencrypted** in the browser. Losing them loses the
  deposit; leaking them lets others withdraw.
- **Disclosures are signed attestations**, not zero-knowledge proofs. Private
  viewing keys live in memory and are lost on reload.
- The dApp reads every commitment from the contract, which will not scale to
  large pools without an indexer. Pool tokens are assumed to have 7 decimals.

## Docker Deployment

The app ships as a multi-stage Docker image (Node build stage → nginx runtime) with SPA routing, asset caching, security headers, and a health check.

**One-command run:**

```bash
docker compose up -d --build        # or: npm run docker:up
```

Then open **http://localhost:3000**.

| Command                 | Purpose                              |
| ----------------------- | ------------------------------------ |
| `npm run docker:build`  | Build the image                      |
| `npm run docker:up`     | Build + start in the background      |
| `npm run docker:down`   | Stop and remove the container        |
| `npm run deploy`        | Same as `docker:up` (loads `.env`)   |
| `./scripts/deploy.sh logs` | Stream container logs             |

## License

MIT
