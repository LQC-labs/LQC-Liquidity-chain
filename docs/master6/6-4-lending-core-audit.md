# Master 6/4 — Lending Core Reuse Audit

Status: verification-only

## Purpose

Audit the existing Lending Core before adding new custody, debt or supplier-accounting logic.

## Existing implementation reused

`LQCLendingCore` already provides:

- isolated-market collateral custody;
- indexed supplier liquidity shares;
- indexed borrower debt shares;
- explicit bad-debt shares and protocol reserves;
- exact inbound-transfer checks;
- non-reentrant fund-moving entry points;
- Market Registry cap / minimum-borrow / risk enforcement;
- Interest Index integration;
- safe collateral withdrawal checks;
- liquidity availability enforcement;
- third-party repayment;
- liquidation entry restricted to the configured Liquidation Engine;
- explicit reserve, supplier-loss and bad-debt accounting domains;
- two-step ownership transfer.

Existing runtime and invariant tests cover principal supply/borrow/repay/withdraw flows, 50% max-LTV enforcement, paused-market safe exits, supplier yield/reserve reconciliation, liquidation boundaries, bad debt and custody invariants.

## Reuse decision

The current Core is the Master 6/4 baseline and MUST be reused unless a demonstrated accounting or security gap requires extension.

The Core must remain independent from Futures accounting and must continue to consume reviewed Registry / Oracle / Interest Index interfaces rather than embedding those concerns directly.

No deployment, market activation, borrowing, liquidation or production activation is authorized by this audit.

`activationAuthorized: false`
