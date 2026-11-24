# Contributing

1. Open an issue for anything larger than a small fix.
2. Branch from `main`; keep each commit one self-contained change.
3. Use [Conventional Commits](https://www.conventionalcommits.org/) messages.
4. Before opening a pull request:

   ```bash
   npm run verify
   (cd packages/contract && cargo test)
   ```

   For changes to the circuit, contract, client or dApp flows, also run
   `npm run test:e2e` and `npm run test:browser` (see the README).

Changing `circuits/withdraw.circom` invalidates the proof in
`packages/contract/src/fixture.rs`. Regenerate it with
`npm run build:circuits && npm run build:sdk && npm run build:fixture`.
