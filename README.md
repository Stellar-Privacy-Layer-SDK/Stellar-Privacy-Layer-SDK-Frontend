# 🔒 Stellar Privacy Layer — Confidential Transfers SDK

A developer-friendly SDK and reference dApp for **confidential asset transfers on Stellar** using Protocol 25 ZK primitives. It enables client-side transaction privacy with institutional compliance through selective-disclosure viewing keys.

> **The "hug and ripples" concept:** a shielded transfer is like a hug — the act itself is felt (the shielded pool grows, a commitment ripples onto the ledger) but the details (who, how much, to whom) stay private. Every shielded transaction sends out ripples of privacy across the network.

---

## Features

- **Shielded Transfers** — Deposit and withdraw assets privately using zero-knowledge proofs
- **Real Poseidon Hashing** — BN254 field Poseidon hash via `@noble/curves` (not a SHA-256 placeholder)
- **Groth16 Proofs** — Simulated prover with Fiat–Shamir verification for development; real `snarkjs` prover with hosted-circuit artifact loading for production (see [Production ZK Prover](#production-zk-prover))
- **Soroban Verifier Contract** — Rust reference implementation using Protocol 25 built-in ZK ops (BN254 pairing precompile)
- **Selective Disclosure** — Compliance-friendly viewing keys with scoped access (amount-only, recipient-only, full)
- **Freighter Wallet** — Full integration with the Freighter API for Stellar wallet connectivity
- **Persistence** — State preserved across sessions via pluggable storage providers (`localStorage`, memory)
- **Multi-Network** — Testnet, Mainnet, Futurenet, Sandbox with one-line switching

---

## Project Structure

```
packages/
  core-sdk/       — SDK library (TypeScript, 169 tests / 14 suites)
    src/
      privacy/    — ShieldedTransfer, ProofGenerator, SimulatedProver, SnarkjsProver, Verifier
      stellar/    — StellarClient (Soroban RPC), WalletManager (Freighter API)
      compliance/ — ViewingKeyManager, SelectiveDisclosure
      utils/      — Poseidon hash, encoding, storage providers, structured logger
      e2e/        — Full end-to-end SDK flow test
  dapp/           — React reference dApp (Vite + Tailwind, 71 tests / 16 suites)
  contract/       — Soroban verifier contract (Rust, 8 tests)
circuits/           — circom 2 circuit for shielded transfers (commitment/nullifier)
scripts/            — build-circuits.sh (artifact generation), deploy.sh
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
| `npm test`                     | Run all unit + integration tests (240 tests)   |
| `npm run test:coverage`        | Run tests with coverage (80%+ thresholds)      |
| `npm audit`                    | Dependency vulnerability scan                  |
| `npm run verify`               | **Full gate:** lint → typecheck → coverage → build |
| `npm run docker:up`            | Build & run the Dockerized dApp                |
| `npm run deploy`               | Same as `docker:up` via `scripts/deploy.sh`    |

---

## Testing & Coverage

Both packages use **Vitest** with enforced coverage thresholds (CI fails below them):

- **core-sdk:** 169 tests, **~94% line coverage** (statements/functions/branches ≥ 80/75)
- **dapp:** 71 tests, **~91% line coverage**
- **contract:** 8 Rust unit tests (deposit, double-spend, viewing-key lifecycle, proof verification)

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
cargo test        # run the 8 unit tests
cargo build       # build the cdylib
```

To deploy on a live network you'll need the `soroban-cli` toolchain (see the [Soroban docs](https://soroban.stellar.org/docs)). The contract exposes `deposit`, `withdraw`, `verify_proof`, `set_vkey`, `set_viewing_key`, `revoke_viewing_key`, and `is_nullifier_spent`.

---

## CI/CD

GitHub Actions (`.github/workflows/ci.yml`) runs on every push/PR to `main`:

1. **lint-and-typecheck** — ESLint, `tsc --noEmit`, and `npm audit`
2. **test-sdk** — core-sdk tests with coverage thresholds
3. **test-dapp** — dApp tests with coverage thresholds
4. **build** — production build of both packages (gated on 1–3)
5. **contract** — `cargo test` for the Rust verifier (with cached deps)

All checks must pass before merge. Locally, `npm run verify` replicates the full gate.

Additionally, `.github/workflows/deploy.yml` deploys the dApp to **Vercel** on every push to `main`. It is skipped (not failed) until the `VERCEL_TOKEN`, `VERCEL_ORG_ID`, and `VERCEL_PROJECT_ID` secrets are configured — see [Deployment](#deployment).

---

## Production ZK Prover

Out of the box the SDK uses the **simulated prover** (dev-only, no security). To generate **real Groth16 proofs**:

1. **Build the circuit artifacts** (requires `circom` + `snarkjs`):

   ```bash
   ./scripts/build-circuits.sh
   ```

   This compiles [`circuits/shielded_transfer.circom`](circuits/shielded_transfer.circom) and produces `shielded_transfer.wasm`, `shielded_transfer_final.zkey`, and `verification_key.json` in `./artifacts`.

   > ⚠️ The bundled ceremony uses a deterministic dev beacon. For mainnet you MUST use a public trusted-setup ceremony.

2. **Host the artifacts** at a stable URL (GitHub Release, CDN, etc.).
3. **Point the dApp at them** — set `VITE_ZK_ARTIFACTS_URL=<base-url>` in your build env. The dApp then constructs a `SnarkjsProver` that fetches the artifacts and produces real proofs, with the simulated prover as automatic fallback when the var is unset.

Programmatic usage:

```ts
import { PrivacySDK, SnarkjsProver, resolveArtifactUrls } from '@stellar-privacy/sdk';

const sdk = new PrivacySDK({
  network: myNetworkConfig,
  prover: new SnarkjsProver(resolveArtifactUrls('https://cdn.example.com/artifacts')),
});
await sdk.initialize();
```

> **Note:** `SnarkjsProver` returns the circuit's public signals verbatim (snarkjs emits **decimal** field strings), while `SimulatedProver` returns hex strings. Any contract/verifier integration must normalize formats — see the public-input layout documented in `circuits/shielded_transfer.circom`.

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
- Zero known npm vulnerabilities (`npm audit` is clean and enforced in CI)
- Contracts validate inputs (checksum-valid Stellar keys, amount ranges, memo truncation)
- Production security headers + immutable asset caching baked into the nginx config
- ⚠️ The **simulated prover** is for development/demo only. For production-grade privacy, generate real Groth16 artifacts with `scripts/build-circuits.sh` (or a public ceremony), host them, set `VITE_ZK_ARTIFACTS_URL`, and deploy a verifier contract — see [Production ZK Prover](#production-zk-prover).

---

## License

MIT
