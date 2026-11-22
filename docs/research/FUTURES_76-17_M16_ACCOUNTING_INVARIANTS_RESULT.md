# 76-17-⑥-⑤ / M16 — Isolated Futures repeated accounting invariants

**Result: Focused Foundry 9 PASS / 0 FAIL. M07 actual migration and new-stack deployment remain BLOCKED.**

## Reproducible evidence

- Test file: `test/LQCFuturesMigrationM16AccountingInvariants.t.sol`
- Focused CI workflow: `.github/workflows/futures-m16-accounting-invariants.yml`
- GitHub Actions run: https://github.com/LQC-labs/LQC-Liquidity-chain/actions/runs/45049156235
- Test commit: `23451289eb7dd1e4a9162bbdf8214cb881dae019`
- Compiler: Solidity 0.8.30 viaIR, optimizer 200, Shanghai EVM.
- Nine isolated tests include six inherited M09/M15 scenarios plus three newly added accounting invariants.

## New targeted invariants

1. **Four successive partial reductions:** 2,000 synthetic notional shrunk in 100, 300, 600, and 1,000 notional slices. Reconciles `openInterestUsd` after each action, user's available+locked to `totalAccounted`, and asset balance to reserved funding/Insurance/Treasury balances. At 1% synthetic fee and 60% Insurance share, after open+all reductions Insurance=24 synthetic units, Treasury=16, accounted=2960, locked=0 and OI=0.
2. **Repeated Funding checkpoint:** 2 synthetic units debited once from an opened long at funding index delta 1e24. Recalling `settleFunding` without index advancement does not debit a second time. Then 800 notional reduction followed by final close preserves funding pool=2, user accounting and legacy Vault custody.
3. **Insurance/loss debt:** 2,000 long notional with 500 synthetic margin, 1% fee (Insurance reserve 12 and Treasury 8), adverse Oracle from 50,000 to 25,000, and 50% insurance coverage cap. The full liquidation realizes a 500-unit deficit beyond margin: Insurance uses 12, **488 units explicit residual bad debt**; Treasury remains 8. `isFullyBacked` still returns true for physical Vault balances, whereas `isSolvent` correctly returns false because bad debt is unresolved. Old Vault balances remain unchanged.

The synthetic mocked assets are **not** historical on-chain mUSDT. Legacy BSC Testnet account rights of 5,000 mUSDT at the frozen M08 block are still separately protected. This test performs no actual user withdrawal, signing, transfer, chain RPC, old `setEngine`, deployment or PR #460 change.

## Limits and next engineering concern

M16 covers **fixed reproducible sequences**, not arbitrary randomized states or a full smart-contract audit. It verifies the test stack's present accounting outcomes; it does not claim economically fair loss socialization or production-safe pricing. Open risks include arbitrary partial-liquidation sequences, fee rounding with very small position slices, deferred closed Funding claims/debts, deep negative Funding/Insurance interactions and EIP-170 deployability.

**Recommend M17:** narrow deterministic fuzz / boundary testing of partial liquidation and fee rounding, preserving one-branch-only research development and no repeated M16 CI unless a concrete defect is fixed.
