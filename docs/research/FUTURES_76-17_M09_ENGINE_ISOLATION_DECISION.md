# 76-17-⑥-⑤ / M09 — Futures Engine replacement decision and cutover boundaries

**Status: DESIGN DECISION — ISOLATE NEW STACK / LEGACY RIGHTS REMAIN / NO CUTOVER AUTHORIZED**

## Decision

**Preferred next-stage strategy: leave the historical BSC Testnet MVP Registry/Vault/Engine unchanged; validate the current Futures stack on new, distinct Registry+Vault+Engine addresses in an isolated, test-only environment.** Do not invoke `setEngine` on the historical Vault as an upgrade shortcut, and do not move its collateral automatically.

This is a **research design recommendation**, not an authorization to deploy, configure, activate, or transfer tokens.

## Verified basis

- Historical BSC Testnet Engine `0xe4f1320c8709631776c7e39e0916584935882525`, Vault `0xb532c65294a7b35ca510a7df025e934fa17c8d7e`.
- Historical record at block `144115366`: known account `0xde05e09db1292aff6ab62164134f1ad384bca6fb` has no open position or locked collateral, but **5000 mUSDT available**.
- Vault `totalAccounted`, known user's available balance and actual ERC20 Vault balance were each 5000 mUSDT at that frozen observation. The complete independent inventory attestation is outstanding.
- M02–M06 isolated tests prove that a raw Engine pointer switch neither imports open positions nor pending Funding, and that restoring the pointer can work under the specific tested no-target-write fixture. They do **not** prove live cutover/rollback.
- Legacy MVP and current research Solidity differ in ABI and accounting: the historical Engine lacks modern `openInterestUsd`, Funding and Insurance getters. Never treat missing getters as zero.
- Modern `Vault.setEngine` is owner-only and checks only nonzero address; user rights and migration safety are not checked inside it.
- Existing PR #460 is a separate Draft with current head `42fb30262f581a772a88d5385199cb58e5ef575b`, awaiting independent security review.

## Options and decision matrix

| Option | Decision | Security/economic consequence |
| --- | --- | --- |
| A. Leave historical stack undisturbed | **PREFERRED FOR HISTORICAL ASSETS** | Keeps rights and claim path in place; review whether legacy user withdrawals remain possible before any retirement |
| B. Point historical Vault to new Engine | **REJECT FOR NOW** | Does not import state; old Engine loses Vault authorization, risks stranded positions/settlement |
| C. Require completed lifecycle and user-rights reconciliation before a same-Vault pointer swap | **CONDITIONALLY EVALUATE ONLY** | Even zero open positions is insufficient: available balances, reserves, claims, permissions and rollback are separate obligations |
| D. Create an independently deployed new test-only Registry/Vault/Engine, leaving legacy stack intact | **PREFERRED FOR FUTURE RESEARCH** | New users/assets remain distinct; no shared account ledger, implicit token transfer or hidden custody assumption; requires separate deployment approval |
| E. Copy storage or sweep legacy Vault funds into new Vault | **PROHIBITED WITHOUT NEW DESIGN/AUTHORIZATION** | Risks unauthorized asset movement, economic double credit and incomplete liabilities |

## Preconditions for any eventual historical cutover (all must be independently satisfied)

1. **Inventory:** event source retention/completeness, accounts/markets/tokens, deployment and block hash lineage independently attested.
2. **Snapshot:** all user positions/available/locked plus old ABI-compatible reads reconciled at one canonical block.
3. **Rights:** explicit strategy for the 5000 mUSDT user-available balance; users' existing withdrawals, authorization, recovery and ownership rights preserved and tested; no silent migration.
4. **Zero/debt disposition:** open positions, Funding, debt, fee reserves, insurance and closed claims must be resolved or migrated via an independently audited mechanism. Missing getters imply **UNKNOWN**, not zero.
5. **Isolation:** no reused Vault as a shortcut; new test-only Registry/Vault/Engine require distinct addresses, fresh oracle/provenance checks, their own governance process.
6. **Rollback:** rollback tests must include replacement Engine writes and user actions, not only switching a pointer back. Switching back after new writes may not restore prior accounting.
7. **Governance:** external independent review, formal change approval and explicit deployment/asset-transfer authorization (not supplied by M09).

## Recommended next engineering verification: M09 isolated no-cross-contamination gate

In research code only, use a **fresh test-only Registry/Vault/Engine** alongside the legacy fixture. Confirm (i) distinct Vault balances and Engine pointers, (ii) zero spontaneous imported positions and Funding, (iii) a new user's deposits and trades do not modify historic Vault accounting, (iv) legacy 5000 mUSDT available withdrawal remains executable under the unchanged historical Vault **in isolation**, and (v) intentional failure/rollback paths preserve both domains.

Do **not** run this on the live chain, reuse private keys or production accounts, submit transactions, or treat test success as operational permission.

## Final state

M09 design choice **DOCUMENTED**. Real historical migration, code deployment, governance signature, production Oracle configuration, independent approval, PR #460 merge, and asset movement remain **BLOCKED**.
