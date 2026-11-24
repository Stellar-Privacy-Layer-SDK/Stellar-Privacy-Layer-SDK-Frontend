# Stellar Privacy Layer — Confidential Transfers SDK

A developer-friendly SDK and reference dApp for **confidential asset transfers on Stellar** using Protocol 25 ZK primitives. It enables client-side transaction privacy with institutional compliance through selective-disclosure viewing keys.

---

## Features

- **Shielded deposits** with client-side Groth16 proofs (circom + snarkjs)
- **Poseidon over BN254**, checked against circomlib vectors and the circuit
- **Soroban verifier contract** using the Protocol 25 BN254 pairing host functions
- **Selective disclosure** with scoped, Ed25519-signed payloads that stay off-chain
- **Viewing keys** encrypted to the recipient's Stellar account key
- **Reference dApp** for deposits, withdrawals, history and compliance (Freighter)

## Status and limitations

This project is experimental and unaudited. Do not use it with real assets.

- `SimulatedProver` is the default for development. Its proofs are forgeable, and
  the SDK refuses to use it on the public network.
- Withdrawals work only with the simulated prover: there is no membership circuit
  yet, and the contract's `withdraw` enforces one-time nullifiers but does not
  check a proof.
- Disclosure proofs also need a circuit that does not exist yet.
- The contract records amounts in plaintext and does not transfer tokens.
- Private viewing keys live in memory and are lost on reload.

---

## Project Structure

```
packages/
  core-sdk/       — SDK library (TypeScript)
    src/
      privacy/    — ShieldedTransfer, ProofGenerator, SimulatedProver, SnarkjsProver, Verifier
      stellar/    — StellarClient (Soroban RPC), WalletManager (Freighter API)
      compliance/ — ViewingKeyManager, SelectiveDisclosure
      utils/      — Poseidon hash, encoding, storage providers, structured logger
      e2e/        — Full end-to-end SDK flow test
  dapp/           — React reference dApp (Vite + Tailwind)
  contract/       — Soroban verifier contract (Rust)
circuits/           — circom 2 circuit for shielded deposits (commitment/nullifier)
scripts/            — build-circuits.mjs (artifact generation), deploy.sh
```

---

## Requirements

| Tool    | Version   |
| ------- | --------- |
| Node.js | >= 22.12  |
| npm     | >= 10     |
| Rust    | stable    (contract only — `cargo` + `soroban-cli` for deploy) |

---

## Quick Start

```bash
npm install          # install all workspace dependencies
npm run dev          # launch the dApp at http://localhost:3000
```

The dApp runs entirely client-side. Install the [Freighter wallet](https://freighter.app/) browser extension, connect, and you're ready to make shielded transfers.

---

## Environment Variables

Copy `.env.example` to `.env` and adjust:

```bash
cp .env.example .env
```

| Variable                | Required | Default   | Description                                             |
| ----------------------- | -------- | --------- | ------------------------------------------------------- |
| `VITE_STELLAR_NETWORK`  | no       | `testnet` | `public` \| `testnet` \| `futurenet` \| `sandbox`        |
| `VITE_SOROBAN_RPC_URL`  | no       | network default | Custom Soroban RPC endpoint                       |
| `VITE_CONTRACT_ID`      | no       | —         | Deployed privacy contract ID (`C...`)                   |
| `VITE_HORIZON_URL`      | no       | network default | Custom Horizon endpoint                            |
| `VITE_ZK_ARTIFACTS_URL` | no       | —         | Base URL of real Groth16 artifacts (enables `SnarkjsProver`) |
| `VITE_DEBUG`            | no       | `false`   | `true` enables verbose SDK logging                       |

> **Security:** never commit a real `.env`. `.env*` files are git-ignored; only `.env.example` (which contains no secrets) is tracked. All variables are read via `src/env.ts` with validated fallbacks.

---

## Useful Commands

| Command                        | Purpose                                        |
| ------------------------------ | ---------------------------------------------- |
| `npm run dev`                  | Run the dApp (Vite dev server on port 3000)    |
| `npm run build`                | Build SDK + dApp for production                |
| `npm run lint`                 | ESLint over the whole repo                     |
| `npm run typecheck`            | TypeScript strict-mode check (both packages)   |
| `npm test`                     | Run all unit + integration tests            |
| `npm run test:coverage`        | Run tests with coverage (80%+ thresholds)      |
| `npm audit`                    | Dependency vulnerability scan                  |
| `npm run verify`               | **Full gate:** lint → typecheck → coverage → build |
| `npm run docker:up`            | Build & run the Dockerized dApp                |
| `npm run deploy`               | Same as `docker:up` via `scripts/deploy.sh`    |

---

## Testing & Coverage

Both packages use **Vitest** with enforced coverage thresholds (CI fails below them):

```bash
npm run test:coverage        # runs everything and enforces thresholds
```

---

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

Configure the network at build time via env vars (Vite inlines them):

```bash
VITE_STELLAR_NETWORK=testnet VITE_CONTRACT_ID=CA... docker compose build
```

### Manual deployment (no Docker)

```bash
npm ci
npm run build
# serve packages/dapp/dist with any static server, e.g.:
npx serve -s packages/dapp/dist
```

---

## Soroban Contract

The Rust verifier contract lives in `packages/contract/`:

```bash
cd packages/contract
cargo test        # run the unit tests
cargo build       # build the cdylib
```

To deploy on a live network you'll need the `soroban-cli` toolchain (see the [Soroban docs](https://soroban.stellar.org/docs)). The constructor takes an `admin` address, which alone can manage the verification and viewing keys. The contract exposes `deposit`, `withdraw`, `verify_proof`, `set_vkey`, `set_viewing_key`, `revoke_viewing_key`, and `is_nullifier_spent`.

---

## CI/CD

GitHub Actions (`.github/workflows/ci.yml`) runs on every push/PR to `main`:

1. **lint-and-typecheck** — ESLint, `tsc --noEmit`, and `npm audit`
2. **test-sdk** — core-sdk tests with coverage thresholds
3. **test-dapp** — dApp tests with coverage thresholds
4. **build** — production build of both packages (gated on 1–3)
5. **contract** — `cargo test` for the Rust verifier (with cached deps)
6. **circuit** — compiles the circuit and verifies a real proof

All checks must pass before merge. Locally, `npm run verify` replicates the full gate.

Additionally, `.github/workflows/deploy.yml` deploys the dApp to **Vercel** on every push to `main`. It is skipped (not failed) until the `VERCEL_TOKEN`, `VERCEL_ORG_ID`, and `VERCEL_PROJECT_ID` secrets are configured — see [Deployment](#deployment).

---

## Production ZK Prover

Out of the box the SDK uses the **simulated prover** (dev-only, no security). To generate **real Groth16 proofs**:

1. **Build the circuit artifacts** (circom is installed by npm; takes a few minutes):

   ```bash
   npm run build:circuits
   ```

   This writes `shielded_transfer.wasm`, `shielded_transfer_final.zkey` and `verification_key.json` to `./artifacts`.

   > The setup is a single local contribution. Real assets need a public multi-party ceremony.

2. **Host the artifacts** at a stable URL (GitHub Release, CDN, etc.).
3. **Point the dApp at them** — set `VITE_ZK_ARTIFACTS_URL=<base-url>` in your build env. The dApp then constructs a `SnarkjsProver` that fetches the artifacts and produces real proofs, and uses the simulated prover when the var is unset.

Programmatic usage:

```ts
import { PrivacySDK, SnarkjsProver, resolveArtifactUrls } from '@stellar-privacy/sdk';

const sdk = new PrivacySDK({
  network: myNetworkConfig,
  prover: new SnarkjsProver(resolveArtifactUrls('https://cdn.example.com/artifacts')),
});
await sdk.initialize();
```

Public inputs are snarkjs decimal strings; the client encodes them, and the proof, for the contract.

---

## Deployment

### Option A — Vercel (recommended)

1. Push this repo to GitHub and create a project at [vercel.com](https://vercel.com) (root directory: `packages/dapp`).
2. In **Vercel → Project → Settings → Environment Variables**, add `VITE_STELLAR_NETWORK`, `VITE_CONTRACT_ID`, and `VITE_ZK_ARTIFACTS_URL` as needed.
3. Generate a token: Vercel → Account → Settings → Tokens → Create. Then add GitHub secrets `VERCEL_TOKEN`, `VERCEL_ORG_ID`, and `VERCEL_PROJECT_ID` (from `vercel projects ls` / `vercel link`).
4. Push to `main` — `.github/workflows/deploy.yml` deploys automatically.

### Option B — Docker

```bash
docker compose up -d --build        # or: npm run docker:up
```

---

## Security Notes

- No secrets in code — all configuration flows through git-ignored env vars with `.env.example` as the documented template
- `npm audit` runs in CI and fails on high-severity advisories
- The SDK validates inputs (checksum-valid Stellar keys, amount ranges)
- Production security headers + immutable asset caching baked into the nginx config
- ⚠️ The **simulated prover** is for development/demo only. For production-grade privacy, generate real Groth16 artifacts with `npm run build:circuits` (or a public ceremony), host them, set `VITE_ZK_ARTIFACTS_URL`, and deploy a verifier contract — see [Production ZK Prover](#production-zk-prover).

---

## License

MIT
