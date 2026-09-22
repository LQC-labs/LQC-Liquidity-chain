# LQC Active Execution Checkpoint

Status: **operational checkpoint — not a replacement roadmap**

This file preserves the current working method so development can resume consistently without relying on chat memory. Canonical architecture remains in `docs/MASTER_DEVELOPMENT_PLAN.md` and the canonical whitepaper source.

## Agreed development baseline

Use the 15-stage plan with a reuse-first method:

1. Architecture Freeze
2. LQC Flow
3. Router 2.0 / Best Execution
4. Vault / Liquidity
5. Oracle Foundation
6. Lending / Earn / LQC Staking
7. Futures
8. Intent / Internal Solver
9. Solver Network
10. Settlement / Execution Verification
11. Unified Risk / Treasury / Governance
12. Full BSC Testnet Integration
13. Security / Independent Audit
14. Token / CEX Readiness
15. Capped Public Pilot / LQC Mainnet Path

Execution method:

**inspect current main -> reuse verified work -> revalidate where needed -> develop only real gaps -> regression/CI -> Testnet/on-chain evidence only when separately authorized**

Do not restart validated modules from zero. Historical stage labels remain evidence only and do not override the current Master sequence.

## Current stabilization sequence

Before starting the next new Staking implementation, complete this short repository-stabilization sequence:

1. **DONE** — Master 6/14 Supply Earn reuse gate restored on current main and PASS;
2. **DONE in this synchronization set** — open PRs classified as ACTIVE / REUSE / FUTURE / SUPERSEDED-STALE in `docs/OPEN_PR_CLASSIFICATION.md`;
3. **DONE in this synchronization set** — actual main-state matrix updated from repository/test/CI/Testnet/on-chain evidence;
4. **DONE in this synchronization set** — `docs/MASTER_DEVELOPMENT_PLAN.md` current position and `docs/IMPLEMENTATION_MATRIX.md` synchronized;
5. **DONE** — Master 6/15 LQC Staking Vault implemented and merged after CI PASS;
6. **DONE** — Master 6/16 Reward Accounting / Claim merged after CI PASS;
7. **DONE** — Master 6/17 Lock / Cooldown / Unstake merged after CI PASS;
8. **DONE** — Master 6/18 Staking Governance / Emergency Controls merged after CI PASS;
9. **DONE in this gate** — Master 6/19 Lending + Earn + Staking repository E2E;
10. **DONE in this gate** — Master 7/1 Futures latest-main regression + selective reuse/gap reconciliation PASS;
11. **DONE in this gate** — Master 7/2 Independent Runtime Reference Oracle selectively rebuilt from PR #296 design and validated on current main;
12. **DONE in this gate** — Master 7/3 read-only BSC Testnet deployment lineage PASS; all recorded runtimes match current artifacts, while the deployed Oracle remains explicitly test-only;
13. **DONE in this gate** — Master 7/4 Perp Accounting Gap Review PASS; application-layer logic is reusable, while canonical on-chain settlement gaps are identified;
14. **DONE in this gate** — Master 7/5-1 Canonical Partial Position Reduction implemented and regression-tested;
15. **DONE in this gate** — Master 7/5-2 Funding checkpoint/accounting implemented and focused CI PASS;
16. **DONE in this gate** — Master 7/5-3 Trading Fee Accounting + explicit reserve routing implemented and focused CI PASS;
17. **DONE in this gate** — Master 7/5-4 Futures-only Insurance Fund / residual bad debt accounting implemented and focused CI PASS;
18. **DONE in this gate** — Master 7/5-5 Funding-aware Partial Liquidation implemented and focused CI PASS;
19. **NEXT EXECUTABLE** — Master 7/5-6 Bounded ADL primitive for explicit residual bad debt.

## Preserved Staking direction and timing

The canonical Staking economic boundary remains preserved in:

- `docs/STAKING_REWARD_ECONOMIC_BOUNDARY.md`
- `docs/LQC_WHITEPAPER_CANONICAL.md`
- `docs/MASTER_DEVELOPMENT_PLAN.md`

Development timing:

- 6/14 Supply Earn verification must PASS first;
- 6/15 LQC Staking Vault — **PASS**;
- 6/16 Reward Accounting / Claim — **PASS**;
- 6/17 Lock / Cooldown / Unstake — **PASS**;
- 6/18 Staking Governance / Emergency Controls — **PASS**;
- 6/19 Lending + Earn + Staking E2E — **PASS in this gate**.

The LQC Staking Vault is one canonical, independently accounted vault. It is not embedded in Lending Core and staking principal is not silently rehypothecated into Lending.

A future Launchpad reuses the stable Staking state through a reviewed read-only/versioned interface for eligibility data such as balance, lock duration, staking weight or snapshot state. Launchpad does not create a second staking custody domain, does not take staking principal, and does not mutate staking reward accounting.

Exact staking reward budget/emission parameters remain a later economic/governance decision; no new token supply or guaranteed APY is implied.

## Future Earn expansion boundary

After 6/19 completes the canonical LQC Staking path, future major-asset Earn products may be expanded without changing LQC Staking custody:
- USDT/USDC Lending Supply Earn remains borrower-interest-driven;
- future USDT/USDC Locked Earn is implemented as separate asset-specific vault/accounting modules;
- a unified Earn UI/registry may present LQC Staking, Supply Earn and future Locked Earn together;
- stablecoin principal/rewards must not be mixed into the LQC Staking Vault;
- new Earn assets are added through reviewed modules/interfaces rather than rewriting existing Lending or Staking Core.

## Resume rule

When resuming development, read this checkpoint together with current GitHub main and CI state before choosing the next task. If repository evidence conflicts with this checkpoint, update the checkpoint after evidence reconciliation rather than guessing from historical numbering.


## Stage 6 exit boundary

Stage 6 repository development is complete only at the repository/integration evidence level. This does not imply Staking Testnet deployment, approved reward budget, Lending market activation, independent audit, or production release.

The next development lane is Master 7 Futures. Reuse the existing Futures foundation and testnet evidence; do not rebuild it from zero.


## Master 7 Futures execution order

- 7/1 Latest-main Regression / Reuse Reconciliation — **PASS in this gate**
- 7/2 Independent Reference Oracle — **PASS in this gate**
- 7/3 Current Artifact / BSC Testnet Deployment Lineage Reconciliation — **PASS in this gate**
- 7/4 Perp Accounting Gap Review — Funding / Fees / Partial Close / Insurance / ADL — **PASS in this gate**
- 7/5 Selective On-chain Futures Gap Implementation + Regression — **IN PROGRESS**
  - 7/5-1 Canonical Partial Position Reduction — **PASS in this gate**
  - 7/5-2 Funding checkpoint/accounting — **PASS in this gate**
  - 7/5-3 Trading Fee Accounting + explicit reserve routing — **PASS in this gate**
  - 7/5-4 Futures-only Insurance Fund / residual bad debt accounting — **PASS in this gate**
  - 7/5-5 Partial Liquidation — **PASS in this gate**
  - 7/5-6 Bounded ADL primitive — **NEXT**
- 7/6 Futures Risk / Governance / Emergency Integration
- 7/7 Current-release BSC Testnet Futures E2E
- 7/8 Futures Stage Exit / Intent Handoff

Historical Futures branches remain evidence/reuse pools. Current `main` and fresh regression decide what is reused.


## Master 7/5 confirmed implementation order

1. canonical partial position reduction;
2. funding checkpoint/accounting;
3. trading fee accounting and explicit reserve routing;
4. Futures-only Insurance Fund / residual bad debt accounting;
5. partial liquidation reusing the same reduction primitive;
6. bounded ADL primitive for explicit residual bad debt;
7. integrated accounting/regression invariants.

Do not rebuild the existing application-layer Funding/Fee/Insurance/ADL logic. Reuse it as specification and regression evidence while adding only the missing on-chain accounting/custody path.


## Repository execution-speed cleanup

Repository Cleanup 1 is approved and applied as an operational optimization only. It does not change protocol logic, contract state, tokenomics, Testnet state, or the Master development order.

- 68 completed historical Master/Stage workflows are preserved but changed to **manual-only `workflow_dispatch`** so they no longer run automatically on unrelated PRs.
- 6 completed one-off website/profile maintenance workflows are removed.
- Core historical documents, Testnet evidence, deployment records, contract sources, and regression tests are preserved.
- Automatic CI remains focused on the small set of current platform workflows:
  - deploy-pages
  - dex-ci
  - dex-dependency-audit
  - dex-tests
  - futures-bsc-testnet-onchain-wiring
  - futures-mobile-artifact
  - futures-testnet-readonly-preflight
  - futures-tests
- New Master 7/5 substeps should use a focused workflow while under development. After a substep is completed and merged, its workflow should become manual-only instead of remaining an automatic trigger forever.
- Full broad regression is reserved for milestone/integration gates such as 7/5-7, 7/7, Master 12, and Security/Audit gates unless a change materially touches shared Core behavior.

This cleanup is intended to reduce GitHub Runner queue time and repeated full-suite execution while retaining reproducible historical evidence.


## Incremental verification — 8 active rules

The repository now follows `docs/INCREMENTAL_VERIFICATION_POLICY.md`.

1. reuse verified baseline;
2. classify actual changed scope first;
3. focused PR validation;
4. dependency-aware regression;
5. archive completed workflows out of automatic CI;
6. one focused workflow for the active substep, retire after PASS;
7. broad regression does not block every implementation iteration;
8. mandatory full regression at final integration/security gates.

Operational target: validate **changed code first**, then run **full regression at the correct gate**. Do not repeatedly rediscover unchanged historical state.


## 7/5-5 incremental-verification result

The approved incremental method was used for this substep:

- verified 7/5-1 through 7/5-4 baseline was reused;
- only changed Engine/Vault liquidation/funding/Insurance boundaries were revalidated;
- PR automatic validation was limited to **LQC Futures Focused CI + the active 7/5-5 focused workflow**;
- historical Master 2–6 workflows were not replayed;
- mandatory broad/full regression remains scheduled for 7/5-7.

This confirms the repository speed policy is operating as intended without lowering the safety gate.
