# Master 3/7 — Router Failure Atomicity and Residual-Funds Gate

Status: verification gate
Base: 56421d26910fa437fa3f04feff055c6431d1ee7b

## Goal

Prove that Router/Adapter/Proof execution fails atomically and does not strand user assets or approvals when downstream execution rejects or reverts.

## Required invariants

- failed swaps roll back user token movement and Router/Adapter state;
- minimum-output/deadline/risk/adapter failures do not partially consume route state;
- temporary ERC20 approvals are cleared or reverted atomically;
- Router and Proof Gateway retain no unexpected tokenIn residue after success or failure;
- proof consumption rolls back if downstream execution fails;
- disabled/drifted adapters fail before unsafe execution;
- reentrancy attempts cannot leave partial state;
- split execution cannot leave a partially committed successful leg when the transaction as a whole fails.

## Cross-module isolation

A Router failure must not mutate Futures positions/margin, Lending debt/collateral, Staking balances, Intent lifecycle outside an explicitly atomic handoff, or Settlement finality state.

## Exit

3/7 exits with focused EVM regression covering rollback, approval cleanup, zero-residue, proof-consumption rollback, reentrancy and split-route atomicity.

`activationAuthorized: false`
