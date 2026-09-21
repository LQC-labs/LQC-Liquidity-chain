# Master 6/8 — Repay Safety

Status: implementation-gap-fixed

## Purpose

Verify and harden the existing Repay path so debt reduction remains available during emergency market pause without weakening new-borrow controls.

## Gap found

The existing `repay()` path validates any nonzero residual debt through `validateBorrowAmount()`.

Before Master 6/8, `validateBorrowAmount()` called the Registry's enabled-market gate. As a result:

- full payoff could succeed on a paused market because the residual debt was zero;
- partial repayment could fail solely because the market was paused;
- a user could therefore be prevented from reducing risk during an emergency pause.

Blocking risk-reducing repayment is not the intended pause boundary.

## Fix

Master 6/8 separates the two responsibilities:

- `validateBorrowCap()` continues to require an enabled market and therefore continues to block new Borrow risk while paused;
- `validateBorrowAmount()` now validates market existence and the minimum nonzero debt amount without requiring the market to be enabled;
- `repay()` can therefore reduce debt during pause while still rejecting a partial repayment that would leave debt below `minBorrow`.

## Existing Repay implementation retained

- interest accrual before share calculation;
- indexed borrower debt shares;
- exact full payoff when the supplied maximum exceeds actual debt;
- partial repayment share burn;
- third-party repayment;
- exact inbound debt-asset transfer;
- bad-debt-share reduction when applicable;
- non-reentrant execution.

## Runtime evidence added

- paused-market partial third-party repayment succeeds and reduces debt shares;
- paused repayment that would leave sub-minimum debt rejects atomically;
- overpayment input pulls only actual debt and clears all debt shares;
- all prior Borrow, Supply, Collateral and full DEX regressions must remain green.

No live deployment, market activation, or production activation is authorized.

`activationAuthorized: false`
