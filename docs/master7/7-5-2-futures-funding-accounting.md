# Master 7/5-2 — Futures Funding Checkpoint / Accounting

Status: **7/5 substep repository gate**

## Purpose

Implement the second ordered 7/5 substep by converting the already-tested application-layer funding model into a conservative on-chain accounting primitive.

This substep does **not** invent a fixed product funding rate.

## Implemented

### Per-market funding state

`LQCPerpEngine` now stores:

- cumulative funding-per-USD index in RAY precision;
- a Governance-supplied maximum absolute delta per update;
- per-position funding checkpoint index.

`FUNDING_RAY = 1e27`.

The contract has a broad technical safety ceiling of one RAY (100%) per single index update, but the actual market bound is a configuration input. This is not an approved economic funding rate.

### Funding direction

- positive funding-index movement → longs pay shorts;
- negative funding-index movement → shorts pay longs.

The payment is calculated from the position holder's perspective:

- negative payment = debit;
- positive payment = credit.

New positions start at the current funding index, preventing retroactive funding.

### Conserved funding pool

`LQCFuturesVault` now includes a dedicated `fundingPoolBalance[token]`.

Ordinary funding settlement:

- debits a payer's **available** Futures balance;
- increases the dedicated funding pool by the exact same amount;
- credits a receiver only from already collected funding-pool assets;
- decreases the pool by the exact credited amount;
- does not touch locked margin;
- does not mint tokens or consume Lending/Staking balances.

If a receiver attempts to settle before sufficient payer funding exists, the transaction fails closed.

### Position lifecycle integration

Outstanding funding is settled before voluntary:

- partial reduction;
- full close.

This prevents a trader from reducing position size to evade already accrued funding.

After a partial reduction, later funding accrues only against the remaining position size.

## Oracle and authorization boundary

Funding-index updates are restricted to the current Futures Registry owner and require a fresh market Oracle read.

This substep implements accounting safety, not final keeper/Governance operations. Master 7/6 will harden final operational roles, emergency controls and update policy.

## Deliberately deferred

Funding-aware liquidation is not finalized in 7/5-2.

Reason: liquidation must combine:

- funding debt/credit;
- partial liquidation;
- Insurance coverage;
- explicit residual bad debt.

Those accounting paths are intentionally integrated together at 7/5-4/7/5-5 rather than allowing funding to block risk-reducing liquidation prematurely.

## Invariants

- Funding pool transfers are internally conserved.
- Ordinary funding does not mutate locked margin.
- Receiver credit cannot exceed collected funding pool.
- Payer debit cannot exceed available balance.
- Failed settlement does not advance the position funding checkpoint.
- New positions receive no retroactive funding.
- Funding is settled before voluntary size reduction/close.
- Futures funding has no dependency on Lending or LQC Staking.
- No Testnet transaction or deployment is authorized.

`activationAuthorized: false`

## Next

**7/5-3 Trading Fee Accounting + explicit reserve routing**
