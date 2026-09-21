# Master 6/10 — Liquidation Audit

Status: verification-only

## Purpose

Verify the existing permissionless liquidation path against the Master 6/9 Health-Factor boundary and preserve risk-reducing liquidation during an emergency market pause.

## Existing implementation reused

The current Liquidation Engine and Lending Core already provide:

- permissionless liquidator entry through `LQCLiquidationEngine`;
- Core execution restricted to the configured liquidation engine;
- Health-Factor / Registry risk verification before fund movement;
- one-call close factor capped at 50% of outstanding debt;
- governance-bounded liquidation bonus with a 5% protocol maximum;
- exact debt-asset pull from the liquidator;
- collateral seizure capped at available collateral;
- repayment recalculation when collateral is insufficient;
- atomic debt-share and collateral-accounting updates;
- residual bad-debt recording after collateral exhaustion;
- non-reentrant Core execution.

## Runtime evidence added

Master 6/10 adds EVM coverage proving:

- an account exactly at Health Factor 1 is not liquidatable and a rejected attempt leaves accounting unchanged;
- after Health Factor falls below 1, liquidation becomes executable;
- liquidation remains executable while the market is paused because it reduces protocol risk rather than adding new risk;
- a 70 debt position is capped to a 35 debt close in one liquidation;
- with a 5% bonus and a $49 collateral price, the 35 debt repayment seizes exactly 0.75 collateral;
- a zero receiver is rejected;
- direct access to the Core liquidation function remains unauthorized.

## Reuse decision

No duplicate liquidation engine, fixed-price-drop trigger, or Futures-shared liquidation accounting is introduced.

The existing Health-Factor-driven Liquidation Engine / Lending Core path is the Master 6/10 baseline.

No live liquidation, deployment, market activation, or production activation is authorized.

`activationAuthorized: false`
