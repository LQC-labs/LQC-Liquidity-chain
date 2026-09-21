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
8. **CURRENT EXECUTABLE** — Master 6/18 Staking Governance / Emergency Controls.

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
- 6/18 Staking Governance / Emergency Controls — **CURRENT**;
- 6/19 Lending + Earn + Staking E2E.

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
