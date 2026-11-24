# Security

Experimental and unaudited. Do not use with real assets.

Report vulnerabilities privately through GitHub's "Report a vulnerability" on
the Security tab, if enabled; otherwise open an issue asking for a private
contact, without details.

## Threat model

| Adversary | Protection | Not protected |
| --- | --- | --- |
| Chain observer | Cannot tell which deposit a withdrawal spends | Timing, small pools, reusing the depositing account |
| Thief watching the mempool | Proofs are bound to the recipient | |
| Double spender | Nullifiers are recorded and must be canonical field elements | |
| Relayer | Cannot change the recipient or steal | Sees the recipient and the client's IP; can refuse service |
| RPC provider | Cannot forge withdrawals | Sees the client's IP and queries; can withhold data |
| Someone with the browser's storage | Notes and viewing keys are encrypted (PBKDF2, AES-256-GCM) | Weak passwords; malware or scripts while unlocked |
| Holder of phase 2 setup randomness | None | Can forge proofs and drain the pool |
| Contract deployer | No admin functions | Chooses the verification key: check it against your artifacts |

Transaction metadata (status, commitments of your own notes) is in the encrypted
store. Network choice is not encrypted.
