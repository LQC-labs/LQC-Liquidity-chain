# LQC CURRENT STATE

Canonical plan: `docs/LQC_MASTER_DEVELOPMENT_PLAN.md`

## Canonical position
- Repository reconciliation: **1/1 through 1/8 COMPLETE**
- Current work unit: **1/9 — MASTER baseline freeze**
- Next development work unit after baseline freeze: **2/1 — Lending collateral deposit/withdraw verification**
- Verified baseline main: `5e0417d2313f7e11f3254bdbe2c5bc68b88d321d`
- Baseline CI at reconciliation start: LQC DEX CI PASS; DEX tests PASS
- Canonical Lending implementation: `dex/contracts/lending/LQCLendingCore.sol`

## Reconciliation decisions
- PR #70: **HOLD**. Do not merge standalone SupplyVault. Reuse its safety-test patterns in canonical Lending Core verification: supply-cap rollback/state invariance, safe withdrawal during disabled market/risk pause, custody/accounting invariant sequences.
- PR #69: **FROZEN / PRESERVE / REUSE AT 9/1** for Futures production oracle adapter.
- PR #64: **FROZEN / PRESERVE**. Reapply its isolated Intent/Solver/Quote/Settlement modules only at MASTER sections 4–7 on a then-current main baseline.
- PR #63: **REFERENCE / PRESERVE SOURCE**. Do not merge directly; large stale development line.
- PR #56: **REUSE** for quote freshness, timeout and same-block quote safety.
- PR #55: **UI VERIFY ONLY**; do not merge stale branch directly.
- PR #54: **SUPERSEDED** by the canonical MASTER plan/current-state documents.
- PR #53: **REUSE** for wallet account/network execution-context revalidation.
- PR #32: **REFERENCE** for approved 1B / 150M TGE-era tokenomics material; do not merge stale branch directly.
- PR #31: **REUSE** for stale asynchronous quote/race protection.
- PR #3: **OBSOLETE** because its 120M (12%) TGE design conflicts with the later 150M (15%) approved baseline.
- PR #2: **LEGACY / REFERENCE ONLY**; never merge its large stale development line directly.

## Intent preservation boundary
Preserve from the Intent work for later staged reapplication: EIP-712 signed intents, nonce replay protection, escrow lock/refund, solver authorization delays, SolverRegistry/Bond/exposure controls, risk-adjusted quote selection, SettlementLedger duplicate-intent/quote/proof protection, and Router 2.0 same-chain execution integration. Do not activate cross-chain or permissionless solvers before their MASTER gates.

## Futures preservation boundary
Preserve the Chainlink-compatible AggregatorV3 oracle adapter design and tests for 9/1: 1e18 normalization, heartbeat/staleness validation, round/timestamp validation, bounded decimals, primary/reference feed deviation circuit breaker and configuration authorization.

## Execution rules
1. Only one MASTER work unit may be ACTIVE at a time.
2. Before modifying code, verify current `main` SHA, CI/check status, active PR and relevant deployment evidence.
3. Never directly merge a stale-base PR. Reapply only the audited changes to a branch created from the verified current main.
4. Historical deployment evidence is immutable evidence; do not edit it merely to make current code pass.
5. No deployment, wallet signature, token movement or testnet transaction is implied by code completion.
6. Testnet deployment is a separate MASTER gate.
7. Every completed work unit must update this file with evidence and the exact next work unit.

## 1/9 completion gate
Before moving to 2/1:
- re-read current repository main SHA;
- verify CI/check state on that SHA;
- ensure no newer merge invalidates the reconciliation assumptions;
- then mark 1/9 COMPLETE and 2/1 ACTIVE.
