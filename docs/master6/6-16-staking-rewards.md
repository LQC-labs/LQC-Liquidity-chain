# Master 6/16 — LQC Staking Reward Accounting / Claim

Status: **merged accounting foundation plus binding-hardening candidate; exact-revision CI/review required**
Canonical foundation: PR #315, main `9e84866321356a77cddb6d6e8add5c38fb592f46`.

## Purpose and reuse

Continue the existing variable, pre-funded LQC reward implementation. Do not replace it with the overlapping PR #316, which is closed and preserved only as review material.

Principal custody stays in `LQCStakingVault`; reward custody/accounting stays in `LQCStakingRewards`. The vault checkpoints before a principal increase. The binding-hardening follow-up validates the prerequisites for that rule: mutual vault/asset identity, binding before the first stake, and funding only after the reward module is actually bound.

## Implemented scope

- separate reward custody from staking principal;
- pre-funded LQC schedules and cumulative reward-per-token accounting;
- per-user checkpoint and claimable balances;
- exact-transfer reward funding and claims;
- reserve solvency tracking, with full-reserve validation before a claim;
- top-up with the unvested scheduled remainder rolled forward;
- one-time reward binding, reverse vault/asset identity validation;
- rejection of late binding and funding an unbound or duplicate reward module;
- reentrancy guards for funding, claims and checkpoints;
- two-step ownership transfer.

## Economic boundary and unresolved release requirements

No fixed APY is encoded. Runtime fixture budgets are not production approvals. The implementation does not mint tokens or spend Lending accounting balances.

This foundation implements one LQC reward stream. It is NOT a completed independently accounted ecosystem-plus-revenue system. Exact budgets, source wallets, emission bounds, circulating-supply treatment and separate protocol-revenue accounting remain economic/governance and release prerequisites. Do not mix future revenue with ecosystem funding merely because both use LQC.

Zero-staker periods, division rounding and unused-budget return require explicit accounting/disposal review before activation. Already earned liabilities must never be swept. Passing focused CI does not resolve these remaining requirements.

## Review and tests

The initialization-boundary regression tests sufficient-funds/allowance funding before binding, a reward module for another vault, late binding after existing stakes, and a second unbound reward module. Existing Staking and Lending regressions are reused.

The hardening patch is maintained on `codex/master6-16-reward-binding-hardening`, based on the already merged PR #315. Its review must finish before advancing this conversation to 6/17. No old branch is force-pushed or merged wholesale.

## Release boundary

- 6/17: lock / cooldown / unstake, with reward checkpoint before every balance decrease.
- 6/18: pause, emergency, reward-governance limits and migration controls.
- 6/19: Lending + Earn + Staking integrated E2E.
- Testnet deployment and activation: separate review and explicit authorization.

The user exit path is absent. Do not deploy this incomplete candidate, accept user principal or activate real rewards. A repository PASS is not audit or production readiness.
