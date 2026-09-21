# Master 6/15 — LQC Staking Vault

Status: **repository implementation gate**

## Purpose

Implement the one canonical LQC Staking principal vault at the exact point defined by the 15-stage reuse-first plan.

This stage is intentionally narrow. It creates the staking custody/accounting boundary without pulling later-stage concerns forward.

## Implemented in 6/15

- one canonical LQC staking asset;
- exact-transfer staking principal custody;
- per-account `stakedBalance`;
- protocol-wide `totalStaked`;
- read-only `ILQCStakingRead` interface for future reviewed ecosystem consumers;
- donation-resistant accounting: unsolicited tokens do not create staking credit;
- fee-on-transfer inbound rejection;
- reentrancy guard;
- two-step ownership transfer.

## Explicitly deferred by development order

The following are **not** implemented in 6/15:

- reward accounting / claim — **6/16**;
- lock / cooldown / unstake — **6/17**;
- pause, emergency and final governance controls — **6/18**;
- Lending + Earn + Staking E2E — **6/19**;
- Launchpad tier/allocation integration — future Launchpad workstream after the staking interface is stable and reviewed.

Because the user exit path belongs to 6/17, **6/15 is repository-only and must not be deployed or activated with user funds**.

## Isolation invariants

- Staking principal is not Lending supply or collateral.
- Staked LQC is not rehypothecated into Lending.
- The vault has no mint authority.
- Reward budget or APY is not invented in this stage.
- Launchpad does not receive custody rights through the read interface.
- Actual token custody must cover all accounted staking principal.

## Evidence meaning

Passing 6/15 means:

**CANONICAL STAKING PRINCIPAL VAULT IMPLEMENTED + UNIT/INTEGRATION TESTED**

It does not mean Testnet deployment, reward activation, user unstake readiness, audit completion or production readiness.

Next: **6/16 Reward Accounting / Claim**.
