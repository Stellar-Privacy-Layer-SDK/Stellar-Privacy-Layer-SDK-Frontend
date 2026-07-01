# Stellar Privacy Layer — Confidential Transfers SDK

A developer-friendly SDK and reference dApp for confidential asset transfers on Stellar using Protocol 25 ZK primitives. Enables client-side transaction privacy with institutional compliance through selective disclosure viewing keys.

## Features

- **Shielded Transfers** — Deposit and withdraw assets privately using zero-knowledge proofs
- **Real Poseidon Hashing** — BN254 field Poseidon hash via `@noble/curves` (not SHA-256 placeholder)
- **Groth16 Proofs** — Simulated prover with Fiat-Shamir verification; real snarkjs integration available
- **Soroban Verifier Contract** — Rust reference implementation (Protocol 25 built-in ZK ops)
- **Selective Disclosure** — Compliance-friendly viewing keys with scoped access (amount-only, recipient-only, full)
- **Freighter Wallet** — Full integration with Freighter API v3 for Stellar wallet connectivity
- **Persistence** — State preservation across sessions via pluggable storage providers (localStorage, memory)
- **Multi-Network** — Testnet, Mainnet, Futurenet, Sandbox with one-line switching

## Project Structure

```
packages/
  core-sdk/       — SDK library (TypeScript, 83 tests, 9 test suites)
    src/
      privacy/    — ShieldedTransfer, ProofGenerator, SimulatedProver, SnarkjsProver, Verifier
      stellar/    — StellarClient (Soroban RPC), WalletManager (Freighter API)
      compliance/ — ViewingKeyManager, SelectiveDisclosure
      utils/      — Poseidon hash, encoding, storage providers
      e2e/        — Full end-to-end integration test
  dapp/           — React reference dApp (Vite + Tailwind, 7 tests)
  contract/       — Soroban verifier contract (Rust)
```

## Quick Start

```bash
npm install
npm run test -w packages/core-sdk
npm run dev              # launch dApp
```

## Test Suite

```
✓ 83 tests across 9 files — all passing
  - 18 crypto tests (Poseidon, nullifier, commitment, key generation)
  -  7 proof-generator tests (generate, verify, tamper detection)
  -  7 shielded-transfer tests (deposit, persistence, events)
  -  7 selective-disclosure tests (request, scope, verify)
  -  9 viewing-key tests (create, grant, revoke)
  -  9 StellarClient tests (connect, switch, deposit, withdraw, verify)
  -  5 verifier tests (local verify, structure check)
  - 12 encoding tests (hex, base64, field conversion)
  -  9 e2e tests (full SDK flow, persistence, Groth16 structure)
```

## Requirements

- Node.js >= 18
- npm workspaces

## License

MIT
