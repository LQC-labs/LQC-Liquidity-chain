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

Do not restart validated modules from zero. Historical stage labels remain evidence only. The working sequence may change only with documented dependency/impact reasoning, not an invented competing roadmap.

## Current position

- Stabilization/PR classification: completed in PR #313; do not repeat from zero.
- 6/14 Supply Earn accounting reuse: PR #310 merged.
- 6/15 principal-only Staking Vault: PR #314 merged, `49e3886fe7bde642306a1173153d0396c30c0f7e`.
- 6/16 reward accounting foundation: PR #315 merged, `9e84866321356a77cddb6d6e8add5c38fb592f46`.
- CURRENT: 6/16 reward-binding hardening on `codex/master6-16-reward-binding-hardening`; verify exact-head CI and review before completion credit.
- PR #316: closed, unmerged overlapping candidate; preserve as review material only. Do not start a second principal/reward system from it.
- NEXT AFTER CURRENT REVIEW: 6/17 Lock / Cooldown / Unstake. Remaining reward economic/release gaps stay tracked in `docs/master6/6-16-staking-rewards.md`.
- BLOCKED: Staking deployment, user principal deposits, real reward funding, new wallet signatures or broadcasts, and market activation. The exit and later release gates are not complete.

## Preserved Staking direction and timing

The canonical Staking economic boundary remains preserved in:

- `docs/STAKING_REWARD_ECONOMIC_BOUNDARY.md`
- `docs/LQC_WHITEPAPER_CANONICAL.md`
- `docs/MASTER_DEVELOPMENT_PLAN.md`

Order: **6/15 Vault -> 6/16 Reward Accounting / Claim -> 6/17 Lock / Cooldown / Unstake -> 6/18 Governance / Emergency Controls -> 6/19 Lending + Earn + Staking E2E**.

One canonical LQC Staking Vault remains independent from Lending. Staking principal is not silently rehypothecated. Future Launchpad uses a reviewed read-only/versioned eligibility interface and cannot custody principal or alter reward accounting. Launchpad implementation is not part of the current step.

Exact reward budgets, source wallets, emission and separate revenue policy require economic/governance review; no new token supply or guaranteed APY is implied. Test amounts are fixtures only.

## Resume and concurrency rule

Read this checkpoint, current main, the active PR diff and exact-head checks before selecting the next task. If main or an overlapping PR changes during work, re-read before writing. Preserve and isolate duplicate work instead of force-pushing or merging both. Use non-forced, commit-pinned changes and report any unresolved conflicts.

`성공` means continue repository development, not authorize on-chain execution. A runtime test PASS is not a release. Keep code, CI, Testnet and audit evidence separate.
