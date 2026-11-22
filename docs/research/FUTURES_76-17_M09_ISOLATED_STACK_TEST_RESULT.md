# 76-17-⑥-⑤ / M09 — Isolated stack Foundry test result

**Design:** preserve historical BSC testnet Vault/Engine/Registry and all legacy account rights; investigate a distinct new Registry/Vault/Engine without any implicit state or asset transfer.

- Design source: `docs/research/FUTURES_76-17_M09_ENGINE_ISOLATION_DECISION.md`
- Focused test file: `test/LQCFuturesMigrationM09IsolatedStack.t.sol`
- GitHub Foundry run: https://github.com/LQC-labs/LQC-Liquidity-chain/actions/runs/45046294603 — **SUCCESS**.
- Candidate commit tested: `edf0e028c2bf7e9a4956a2a234594bc9309c14da`.

## Verified synthetic scenarios

1. `test_M09_ParallelNewStackDoesNotMutateExistingAccountOrVault`: legacy-like account retains 5000 tUSD available in its distinct Vault. A new user deposits and opens a position in a separate Registry/Vault/Engine. Assertions cover unchanged original Vault custody and accounting, old Engine pointer, distinct new Engine pointer, separate OI, and no imported user position.
2. `test_M09_LegacyWithdrawalWorksAfterNewStackActivity`: in the isolated Foundry fixture, original user withdraws 5000 tUSD from original Vault after the new stack has active trading; the new Vault's accounting, locked margin, and token custody remain unchanged.

The synthetic fixture uses new, mock tokens and newly created test contracts. It **does not** interact with the actual historical BSC testnet Vault or prove that a real-world upgrade, live withdrawal, snapshot completeness or governance approval has occurred.

## Decision and blockers

- **M09 isolated regression: PASS.**
- **Historical user balance right: must remain preserved; no forced transfer.**
- **M07/M08 real asset migration/cutover: BLOCKED.**
- **PR #460: separately Draft; independent review pending.**
- **Operational deployment: NOT AUTHORIZED.**

Next verification candidate: design a *no-secret, read-only* per-chain pre-deployment isolation manifest and independent governance review of proposed new Registry/Vault/Engine addresses. Never invoke `setEngine` on the historic Vault as part of this research gate.
