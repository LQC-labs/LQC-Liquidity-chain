# Master 6/3 — Lending Interest Index Reuse Audit

Status: verification-only

## Purpose

Audit the existing per-market Borrow/Supply index implementation before adding new accrual logic.

## Existing implementation reused

`LQCLendingInterestIndex` already provides:

- per-market Borrow and Supply indexes initialized at 1e27 RAY;
- deterministic elapsed-time accrual using the approved Interest Rate Model;
- separate preview and state-mutating accrue paths;
- accrual mutation restricted to the configured Lending Core;
- explicit not-initialized and overflow failure paths;
- supply-loss application restricted to the configured Lending Core;
- two-step ownership transfer;
- event evidence for initialization, accrual and supply-loss application.

The runtime Lending tests already verify that Borrow and Supply indexes grow over time, that Borrow index growth exceeds Supply index growth under the configured reserve factor, and that Core integration reconciles borrower interest, supplier yield and protocol reserves.

## Reuse decision

The current index implementation is the Master 6/3 baseline and MUST be reused unless a demonstrated accounting or security gap requires extension.

Index arithmetic remains isolated from Futures accounting and does not imply fixed supplier APY.

No deployment, market activation, index mutation on testnet or production activation is authorized by this audit.

`activationAuthorized: false`
