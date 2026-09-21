# Master 6/7 — Borrow Reuse Audit

Status: verification-only

## Purpose

Verify the existing indexed Borrow path after the Master 6/6 cap-semantics correction. Reuse the existing Lending Core implementation unless a concrete accounting or risk gap is found.

## Existing implementation reused

`LQCLendingCore.borrow()` already enforces:

- nonzero borrow amount and nonzero receiver;
- unresolved bad-debt exclusion;
- available debt-asset liquidity before transfer;
- indexed borrower debt shares using the current Borrow Index;
- cumulative market `borrowCap` through the dedicated Registry borrow-cap gate;
- per-account minimum remaining debt;
- post-borrow account-risk validation;
- protocol Maximum-LTV ceiling through the Registry / Health-Factor risk path;
- market-enabled enforcement through the Registry;
- non-reentrant execution;
- debt-asset transfer only after all accounting and risk checks pass.

## Evidence gap fixed

The Core already enforced `borrowCap`, but the repository did not have a dedicated EVM regression proving that the cap is cumulative across multiple borrower accounts after the 6/6 split-cap correction.

Master 6/7 adds a runtime regression that proves:

- sub-minimum first borrow rejects without accounting drift;
- valid borrows mint indexed debt shares;
- aggregate debt below the cap succeeds across separate accounts;
- the next borrow that would cross the cumulative `borrowCap` fails atomically;
- guardian market pause blocks new borrow without mutating debt shares.

Existing EVM coverage continues to prove the 50% Maximum-LTV boundary, available-liquidity protection, repayment path, and paused-market safe exits.

## Reuse decision

No duplicate Borrow Manager or alternate debt ledger is introduced.

The current Core / Registry / Interest Index path is the Master 6/7 baseline. Production contract behavior is unchanged by this audit; only missing runtime evidence and its CI gate are added.

No deployment, borrowing on a live network, market activation, or production activation is authorized.

`activationAuthorized: false`
