# Master 6/17 — LQC Staking Lock / Cooldown / Unstake

Status: **repository implementation gate**

## Purpose

Complete the user principal exit path in the canonical LQC Staking Vault without pulling Master 6/18 governance/emergency controls forward.

## Implemented in 6/17

- optional user-controlled lock extension;
- lock expiry check before an unstake request;
- partial or full unstake request;
- active stake removed from reward weight at request time;
- cooldown custody tracked separately from active staking;
- exact principal transfer after cooldown;
- cancellation of a pending exit without retroactive cooldown rewards;
- one pending exit per account to keep accounting deterministic;
- `totalPendingUnstake` and per-account pending-exit read state;
- backing check covers active stake + pending cooldown principal.

The cooldown duration is a deployment/configuration input. This stage does **not** declare a permanent product duration such as 7/14/30 days.

## Reward interaction

Before active stake is reduced or restored, the Staking Vault checkpoints Master 6/16 reward accounting.

Therefore:

- accrued rewards before an unstake request are preserved;
- pending/cooldown principal does not earn new rewards;
- cancelling an exit does not receive rewards retroactively for the cooldown interval;
- reward custody remains separate from principal custody.

## Lock boundary

`extendLock` is voluntary and can only move the caller's lock forward. Preset products such as Flexible / 90D / 180D may later be expressed through UI/config and reviewed reward/eligibility policy; this Core stage does not hard-code yield multipliers or promise higher APY.

## Deferred to 6/18

- pause/resume controls;
- cooldown parameter mutation with governance bounds;
- emergency exit policy;
- reward schedule governance bounds;
- module migration/replacement controls;
- final role separation.

## Future Earn expansion preserved

After the LQC Staking path reaches 6/19, future USDT/USDC Locked Earn may be added as **separate asset-specific Earn modules** behind a unified Earn UI/registry.

Those future modules do not reuse LQC Staking principal custody and must not mix stablecoin Lending/Supply accounting with LQC Staking rewards.

## Evidence meaning

Passing 6/17 means:

**LOCK + COOLDOWN + USER UNSTAKE PATH IMPLEMENTED AND TESTED**

It does not mean Governance/Emergency controls, Testnet deployment, production activation, or USDT/USDC Locked Earn implementation is complete.

Next: **6/18 Staking Governance / Emergency Controls**.
