# 76-17-⑥-⑤ / M08→M07 — Historical MVP evidence compatibility result

**Status: KNOWN-ACCOUNT EVIDENCE RECONCILED / M07 CUTOVER BLOCKED**

## Implemented in research branch

- Pure, offline adapter: `scripts/review-futures-m08-for-m07.mjs`
- Historical frozen observation test fixture: `test/fixtures/futures-m08-frozen-observation.json`
- Regression tests (including frozen observation input): `test/futures-m08-m07-legacy-bridge.test.mjs`
- GitHub Actions verified: https://github.com/LQC-labs/LQC-Liquidity-chain/actions/runs/45046000111 (SUCCESS; test stage).
- Based on previously captured M08 HyperSync range and independent receipt/known-account balance evidence; no fresh on-chain query in this verification.

## Findings

- Historic BSC Testnet chain 97, Engine `0xe4f1320c8709631776c7e39e0916584935882525`, Vault `0xb532c65294a7b35ca510a7df025e934fa17c8d7e`.
- Indexed range `[131945040,144115367)`: five selected lifecycle events and one discovered account, previously checked against five transaction receipts.
- Known user `0xde05e09db1292aff6ab62164134f1ad384bca6fb` at block 144115366: no open position, no locked collateral; available `5000000000000000000000` base units.
- For the recorded test collateral, available balance, Vault `totalAccounted` and ERC20 actual balance match.
- The offline adapter validates these **supplied** facts and rejects inconsistencies; it always rejects operational cutover.

## Unresolved conditions

Historical MVP has no later `openInterestUsd` / Funding or Insurance reserve getters. Their values are marked **UNSUPPORTED**, never forged as zero. Independent completeness/retention attestation, production Oracle/proxy checks, actual migration procedure, rollback approval, and official independent security review remain outstanding.

The bridge does **not** feed fabricated fields to the latest M07 snapshot schema. It is a separate legacy-profile check designed to preserve correct BLOCKED classification.

**Decision: M08 historical known-account check PASS; M07 full migration authorization BLOCKED.**

No signing, transactions, deployment, `setEngine`, PR #460 modification, or main merge.
