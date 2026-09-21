# Master 6/1 — Lending Market Registry Reuse Audit

Status: verification-only

## Purpose

Start Master Stage 6 by auditing the existing Lending Market Registry before adding new market-configuration code.

## Existing implementation reused

`LQCLendingMarketRegistry` already provides:

- deterministic market IDs from collateral/debt asset pairs;
- governance-controlled market configuration;
- separate guardian disable and owner re-enable authority;
- protocol Maximum LTV ceiling of 50%;
- liquidation threshold and liquidation bonus bounds;
- supply cap, borrow cap and minimum borrow;
- conservative Oracle-backed account risk calculation;
- deterministic Health Factor / borrow-allowed / liquidatable boundaries;
- two-step ownership transfer.

The registry moves no funds and creates no debt. `LQCLendingCore` remains responsible for enforcing registry checks during supply, borrow, collateral and withdrawal flows.

## Reuse decision

The current registry is the Master 6/1 baseline and MUST be reused unless a demonstrated gap requires extension. Existing LTV / Health-Factor logic is retained; no fixed price-decline liquidation rule is introduced.

No deployment, market activation, borrowing, liquidation or production activation is authorized by this audit.

`activationAuthorized: false`
