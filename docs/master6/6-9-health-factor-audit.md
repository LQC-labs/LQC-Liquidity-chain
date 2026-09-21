# Master 6/9 — Health Factor Audit

Status: verification-only

## Purpose

Freeze the Lending solvency boundary as Health-Factor based and verify the exact runtime relationship between Maximum LTV and liquidation eligibility.

## Canonical risk model

`Health Factor = (Collateral Value × Liquidation Threshold) / Debt Value`

For the initial controlled BSC pilot candidate:

- protocol Maximum LTV hard ceiling: 50%;
- candidate liquidation threshold: 70%;
- candidate maximum liquidation bonus: 5%.

These are risk boundaries, not a fixed-price-drop liquidation rule.

## Existing implementation reused

`LQCLendingMarketRegistry.accountRisk()` already:

- values collateral with the conservative collateral oracle price;
- values debt with the conservative debt oracle price;
- derives `maxDebtValue` from configured Maximum LTV;
- derives `liquidationDebtValue` from the liquidation threshold;
- reports `type(uint256).max` Health Factor for zero debt;
- permits new debt only when debt value is at or below `maxDebtValue`;
- marks an account liquidatable only when debt value is above `liquidationDebtValue`;
- leaves a safety buffer where new Borrow is prohibited but liquidation has not yet begun.

## Runtime evidence added

Master 6/9 adds EVM coverage proving:

- zero debt produces effectively infinite Health Factor and is not liquidatable;
- 2 units of $100 collateral with $100 debt is exactly 50% LTV, still borrow-allowed, and has Health Factor 1.4 at a 70% liquidation threshold;
- debt immediately above the 50% LTV boundary is no longer borrow-allowed while still not liquidatable;
- debt exactly at the liquidation threshold produces Health Factor 1 and is the boundary state;
- debt above that threshold produces Health Factor below 1 and becomes liquidatable;
- a market configuration above the 50% protocol Maximum-LTV ceiling is rejected.

## Boundary semantics

LQC treats Health Factor 1 as the liquidation boundary. The current implementation marks the account liquidatable only once Health Factor is below 1, matching the policy statement that liquidation may execute after the boundary is breached.

No duplicate risk engine or fixed-price-drop liquidation trigger is introduced.

No live deployment, liquidation, market activation, or production activation is authorized.

`activationAuthorized: false`
