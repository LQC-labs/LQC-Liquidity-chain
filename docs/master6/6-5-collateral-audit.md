# Master 6/5 — Collateral Reuse Audit

Status: verification-only

## Purpose

Audit the existing Lending collateral path before adding or changing custody logic.

## Existing implementation reused

`LQCLendingCore` already provides:

- isolated per-market collateral custody and per-account `collateralOf` accounting;
- aggregate `totalCollateral` accounting;
- exact inbound token transfer checks through `_pullExact`;
- non-reentrant collateral deposit and withdrawal entry points;
- market cap and enabled-state enforcement through the Market Registry;
- zero-amount and zero-receiver rejection;
- atomic rejection of over-withdrawal;
- debt-aware collateral withdrawal using current indexed debt;
- post-withdraw account-risk validation against the reviewed Oracle / Registry path;
- safe collateral exit after debt repayment even when new market risk is paused;
- separation from Futures collateral and accounting domains.

Existing regression coverage includes exact deposit accounting, cap overflow rejection without drift, exact receiver withdrawal, zero/invalid withdrawal rejection, 50% max-LTV withdrawal protection, paused-market safe exits, and stale-oracle fail-closed behavior where risk evaluation is required.

## Reuse decision

The current collateral implementation and its existing regression suites are the Master 6/5 baseline and MUST be reused.

No duplicate collateral vault, alternate balance ledger, or Futures-shared collateral accounting is introduced at this stage. Any future collateral extension must preserve single-source Core accounting and pass Lending E2E / invariant regression before integration.

No deployment, market activation, borrowing, liquidation or production activation is authorized by this audit.

`activationAuthorized: false`
