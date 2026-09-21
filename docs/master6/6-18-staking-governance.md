# Master 6/18 — LQC Staking Governance / Emergency Controls

Status: **repository implementation gate**

## Purpose

Add bounded Governance and emergency controls to the canonical LQC Staking stack while preserving a strict non-custodial safety principle:

**Governance may stop new risk or accelerate user exits, but it may not seize staking principal or disable already-earned reward claims.**

## Vault controls

The canonical Staking Vault now supports:

- separate Governance owner and guardian roles;
- guardian/owner pause of new staking and new lock extensions;
- owner-only resume after review;
- guardian/owner activation of emergency user exits;
- emergency exit bypass of existing lock/cooldown for user-controlled withdrawals;
- owner-only emergency-mode disable;
- deployment-time maximum cooldown ceiling;
- owner-only cooldown changes inside that ceiling;
- existing pending exits retain their snapshotted availability timestamp;
- owner-only guardian replacement;
- existing two-step ownership transfer.

Pausing new staking does not block `requestUnstake`, `cancelUnstake`, or `completeUnstake`.

## Reward governance controls

The Reward module now supports deployment-time bounds for:

- total program reward budget;
- maximum reward rate;
- maximum schedule duration.

It also supports:

- separate guardian role;
- guardian/owner emergency pause of new reward funding;
- owner-only funding resume;
- user reward claims even while new funding is paused;
- owner-only guardian replacement;
- existing two-step ownership transfer.

These controls do not authorize any particular LQC budget. Actual budget/emission values remain an economic/Governance decision before deployment.

## Non-custodial emergency invariant

Neither Governance nor guardian receives a function to:

- seize user staking principal;
- redirect a user's unstake to Governance;
- consume staking principal for Lending/Futures losses;
- mint LQC;
- convert paused rewards into Treasury funds.

Emergency controls are fail-safe toward **stopping new inflow and preserving/accelerating user exits**.

## Module migration boundary

The Vault still binds its canonical reward module one time. Arbitrary hot-swapping is intentionally not added because changing reward modules without a full account checkpoint/snapshot can lose or duplicate accrued rewards.

Any future reward-module migration requires an explicit reviewed migration design, snapshot/reconciliation procedure and security gate.

## Future Earn expansion preserved

After 6/19, future USDT/USDC Locked Earn remains a separate module family behind a unified Earn UI/registry. Stablecoin Earn governance can reuse the same design principles—bounded parameters, guardian pause, user exit preservation—but does not share LQC Staking custody or reward accounting.

## Evidence meaning

Passing 6/18 means:

**STAKING GOVERNANCE + EMERGENCY SAFETY CONTROLS IMPLEMENTED AND TESTED**

It does not mean Testnet deployment, an approved reward budget, independent audit, production activation, or USDT/USDC Locked Earn completion.

Next: **6/19 Lending + Earn + Staking E2E**.
