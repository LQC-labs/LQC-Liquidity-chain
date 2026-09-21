# Master 6/16 — Reward Accounting / Claim

Status: IMPLEMENTATION CANDIDATE — CI and review pending; not a release.
Base: 49e3886fe7bde642306a1173153d0396c30c0f7e (PR #314, Master 6/15).

## Scope and reuse

Reuse the single LQCStakingVault principal ledger, ILQCStakingRead, SafeTransferLib, IERC20, existing mocks and the Anvil-based tests. Add LQCStakingRewards as a separately funded reward custodian; it has no authority to withdraw or pledge staking principal and never mints tokens. This does not create a second principal-staking vault.

Two bounded accounting streams are supported: ecosystem allocation (the staking asset) and protocol revenue (a reviewed deployment-configured asset). They may use the same token, but their funding, claims and returns stay separately accounted. A combined token reserve prevents cross-stream double spending. The revenue label does not establish that funds are realized protocol income; Treasury provenance and economic approval remain mandatory before activation.

## Accounting rules

- Governance funds each finite epoch by transferring existing tokens; zero funding and active-epoch rewrites are rejected.
- Rewards accumulate by time and current principal weight, not a promised APY. No lock multipliers are introduced in this stage.
- The vault checkpoints OLD balances before adding principal. New or enlarged stakes cannot claim the earlier stake-weight allocation.
- Controller binding is one-time, before the first stake; there is no silent hook replacement or removal.
- Each account retains sub-token rounding remainders. Global index-rounding dust remains conservatively reserved and is not sweepable.
- Empty-stake intervals and amount/duration remainder are never allocated to a later depositor. Only that never-allocated budget may be returned after the epoch ends.
- Earned, unclaimed rewards survive later epochs and cannot be returned by governance.
- Outgoing reward transfers are exact and atomic; failed or fee-charging transfers revert claim accounting.
- Donations do not increase staking balances or scheduled rewards.
- For each stream: funded = paid + refunded + outstanding budget. Combined token custody must cover the sum of outstanding stream budgets.

## Evidence and release boundary

The CI executes behavioral tests for principal isolation, delayed-entry fairness, increased-stake fairness, two streams using the same token, no-staker returns, old liabilities across epochs, duplicate claims, unauthorized calls, funding failure, active-epoch rewrite rejection, transfer-fee rollback and donations. Existing 6/15 and Lending regressions are reused.

Code presence, a PR, or a passing focused test is not an independent audit or a completed Staking release. No real reward budget, rate, duration, source wallet, or revenue-allocation percentage is approved by these fixtures.

- Deployment authorized: false.
- Reward activation authorized: false.
- Market activation authorized: false.
- User principal deposits: prohibited for this incomplete candidate.

6/17 must add exit/lock/cooldown paths and checkpoint before every stake decrease. 6/18 must complete pause, emergency, program-authority and governance controls. 6/19 must verify Lending + Earn + Staking integration. These are still required; this PR must not deploy an incomplete vault.

## Review reference

Solidity security considerations: https://docs.soliditylang.org/en/latest/security-considerations.html (checks-effects-interactions, cross-contract reentrancy, bounded loops). This candidate uses the existing repository compiler/dependency pins, not a toolchain upgrade.
