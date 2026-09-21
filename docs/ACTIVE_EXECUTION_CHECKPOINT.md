# LQC Active Execution Checkpoint

Status: **operational checkpoint — not a replacement roadmap**

This file preserves the current working method so development can resume consistently without relying on chat memory. Architecture remains in `docs/MASTER_DEVELOPMENT_PLAN.md` and the canonical whitepaper source. The agreed 15-stage plan is a working dependency order, not an immutable schedule.

## Agreed development baseline

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

Do not restart validated modules from zero. Historical stage labels do not override the current Master work. Changes to the working order require documented dependencies and impact, not a new competing roadmap.

## Current execution position

- MASTER: 6 — Lending / Earn / LQC Staking.
- COMPLETED: stabilization and PR classification (PR #313); 6/14 Supply Earn accounting reuse (PR #310); 6/15 principal-only Staking Vault (PR #314).
- VERIFIED BASE: `49e3886fe7bde642306a1173153d0396c30c0f7e`, the merge of PR #314. Its five pull-request workflows completed successfully; this is repository test evidence, not a Staking release.
- CURRENT: 6/16 Reward Accounting / Claim implementation and CI review on `codex/master6-16-staking-reward-accounting`.
- CURRENT EVIDENCE: new reward code is an implementation candidate; no 6/16 PASS is claimed until the exact PR revision passes required checks and review.
- NEXT: finish the 6/16 review/CI and update this checkpoint before starting 6/17 Lock / Cooldown / Unstake.
- BLOCKED: Staking deployment, real deposits, real reward funding, market activation and any new on-chain action. The withdrawal path and later safety/release gates remain incomplete.

Stabilization is not restarted just because another development session begins. Preserve the existing `docs/OPEN_PR_CLASSIFICATION.md` classifications and recheck actual PR status before selective reuse.

## Preserved Staking direction and timing

Economic and architecture sources:

- `docs/STAKING_REWARD_ECONOMIC_BOUNDARY.md`
- `docs/LQC_WHITEPAPER_CANONICAL.md`
- `docs/MASTER_DEVELOPMENT_PLAN.md`

Order: **6/15 Vault -> 6/16 Reward Accounting / Claim -> 6/17 Lock / Cooldown / Unstake -> 6/18 Governance / Emergency -> 6/19 Lending + Earn + Staking E2E**.

One canonical principal vault remains independent from Lending accounting. A separate reward custodian does not create a second principal-staking system. Ecosystem and realized-revenue rewards remain separately budgeted, funded and accounted; no new supply or fixed APY is authorized. Runtime test values are fixtures, not a production reward-budget approval.

Future Launchpad consumes reviewed read-only/versioned staking eligibility data after the staking interface is stable. It cannot custody staking principal or change reward accounting. Launchpad integration is not started by this checkpoint.

## Resume rule

Read this checkpoint, the actual current main, the active PR diff, and checks for the exact head revision before selecting work. If evidence conflicts with the checkpoint, reconcile it rather than guessing or restarting. `성공` means continue repository development, not sign, submit or broadcast a transaction.
