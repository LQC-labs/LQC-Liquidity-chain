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

1. restore and PASS Master 6/14 Supply Earn reuse gate on current main;
2. classify open PRs as ACTIVE / REUSE / FUTURE / SUPERSEDED-STALE;
3. build/update the actual main-state matrix using code, tests, CI, Testnet, on-chain and security evidence;
4. synchronize `docs/MASTER_DEVELOPMENT_PLAN.md` current position and `docs/IMPLEMENTATION_MATRIX.md` to that verified state;
5. then start the genuine new implementation gap at Master 6/15.

## Preserved Staking direction and timing

The canonical Staking economic boundary remains preserved in:

- `docs/STAKING_REWARD_ECONOMIC_BOUNDARY.md`
- `docs/LQC_WHITEPAPER_CANONICAL.md`
- `docs/MASTER_DEVELOPMENT_PLAN.md`

Development timing:

- 6/14 Supply Earn verification must PASS first;
- 6/15 LQC Staking Vault;
- 6/16 Reward Accounting / Claim;
- 6/17 Lock / Cooldown / Unstake;
- 6/18 Staking Governance / Emergency Controls;
- 6/19 Lending + Earn + Staking E2E.

The LQC Staking Vault is one canonical, independently accounted vault. It is not embedded in Lending Core and staking principal is not silently rehypothecated into Lending.

A future Launchpad reuses the stable Staking state through a reviewed read-only/versioned interface for eligibility data such as balance, lock duration, staking weight or snapshot state. Launchpad does not create a second staking custody domain, does not take staking principal, and does not mutate staking reward accounting.

Exact staking reward budget/emission parameters remain a later economic/governance decision; no new token supply or guaranteed APY is implied.

## Resume rule

When resuming development, read this checkpoint together with current GitHub main and CI state before choosing the next task. If repository evidence conflicts with this checkpoint, update the checkpoint after evidence reconciliation rather than guessing from historical numbering.
