# Master 7/5-5 — Futures Funding-aware Partial Liquidation

Status: **focused repository implementation gate**

## Purpose

Add the fifth ordered 7/5 substep by reusing the canonical reduction math as a risk-reducing liquidation path and integrating pending Funding plus the existing Insurance/residual-bad-debt boundary.

This gate follows `docs/INCREMENTAL_VERIFICATION_POLICY.md`: changed Futures Engine/Vault accounting is focused-tested first; broad full regression remains reserved for 7/5-7 and later integration/security gates.

## Implemented

### Governance-bounded liquidation step

`LQCPerpEngine.configurePartialLiquidation(marketId, reductionBps, minRemainingSizeUsd)` configures:

- the position-size reduction fraction in BPS;
- an optional minimum remaining USD size.

No product liquidation percentage is hard-coded. A market with no configured partial step preserves the historical full-liquidation behavior.

If a configured partial step would leave a position below the minimum remainder, the Engine promotes the action to full liquidation.

### Funding-aware liquidation preflight

Before liquidation health is finalized, outstanding Funding is crystallized into isolated-margin risk.

`LQCFuturesVault.settleLiquidationFunding` is Engine-only and:

- credits positive Funding directly into locked isolated margin;
- consumes negative Funding from this position's locked margin first;
- then consumes available Futures collateral;
- then uses only bounded Insurance reserve;
- records any unpaid remainder as explicit residual bad debt;
- never uses Treasury reserve, Lending funds or Staking funds.

This prevents a funding payer from blocking liquidation merely by withdrawing free collateral.

### Partial liquidation accounting

For a valid breached position:

- the configured fraction of `sizeUsd` is reduced;
- realized PnL is calculated only on that reduced slice;
- **no margin is released to the user** during partial liquidation;
- realized loss consumes locked margin;
- realized profit, if any, follows the existing PnL settlement boundary;
- the remaining position keeps its original entry price and side;
- if the partial slice would exhaust isolated margin, liquidation is promoted to full liquidation;
- repeated liquidation is possible only if the remaining position is still below maintenance.

The Engine emits both `PositionReduced` and `PositionPartiallyLiquidated` for a partial action.

### Full liquidation / Insurance

Full liquidation continues to use the 7/5-4 bounded Insurance path:

1. isolated margin absorbs loss;
2. configured Insurance may cover the deficit;
3. any uncovered amount becomes explicit residual bad debt.

## Deliberately deferred

- ADL resolution of residual bad debt — **7/5-6**;
- final cross-substep accounting/invariant regression — **7/5-7**;
- Futures Risk/Governance/Emergency integration — 7/6;
- current-release Testnet E2E — 7/7.

No Testnet transaction, redeployment, market activation, signature or user-fund action is authorized.

`activationAuthorized: false`

## Next

**7/5-6 Bounded ADL primitive for explicit residual bad debt**
