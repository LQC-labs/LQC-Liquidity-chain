# Master 6/16 — LQC Staking Reward Accounting / Claim

Status: **repository implementation gate**

## Purpose

Add variable, pre-funded LQC reward accounting to the canonical 6/15 Staking Vault without mixing staking principal with Lending or inventing a fixed APY.

## Architecture

Principal custody remains in:

- `LQCStakingVault`

Reward custody/accounting is separate in:

- `LQCStakingRewards`

The Staking Vault performs a reward checkpoint before any principal balance increase. This prevents a late staker from receiving rewards accrued before that stake.

## Implemented in 6/16

- separate reward custody from staking principal;
- pre-funded LQC reward schedules;
- cumulative reward-per-token accounting;
- per-user checkpointing;
- claimable reward accounting;
- exact-transfer reward funding and claims;
- reserve solvency tracking;
- schedule top-up with the unvested remainder rolled forward;
- one-time binding from the canonical Staking Vault to the reward-accounting module;
- two-step ownership transfer.

## Economic boundary

No fixed APY is encoded.

`fundRewards(amount, duration)` only distributes LQC that has already been transferred into the reward module. The contract has no mint authority.

The exact reward budget, epoch policy, source wallet, emission limits, circulating-supply treatment, and protocol-revenue conversion/distribution policy remain Governance/economic decisions. The current module supplies the accounting primitive; it does not authorize a reward budget.

## Isolation invariants

- staking principal is held only by the Staking Vault;
- reward LQC is held only by the Reward module;
- reward claims cannot consume staking principal;
- Lending supply, collateral, reserves and bad debt are untouched;
- future Launchpad consumers remain read-only to staking state;
- no new LQC supply is created.

## Explicitly deferred

- lock / cooldown / unstake — **6/17**;
- pause, emergency, reward-governance bounds and migration controls — **6/18**;
- Lending + Earn + Staking E2E — **6/19**;
- Testnet deployment/activation — separately reviewed after the repository gates.

## Evidence meaning

Passing 6/16 means:

**VARIABLE PRE-FUNDED REWARD ACCOUNTING + CLAIM IMPLEMENTED AND TESTED**

It does not mean a reward budget is approved, APY is promised, Testnet is activated, or production funds are authorized.

Next: **6/17 Lock / Cooldown / Unstake**.
