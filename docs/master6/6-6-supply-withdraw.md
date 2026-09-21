# Master 6/6 — Supply / Withdraw

Status: implementation-gap-fixed

## Purpose

Verify and harden lender liquidity supply/withdraw accounting before proceeding to Borrow.

## Gap found and fixed

The existing Core incorrectly passed collateral totals into the Registry's `supplyCap` slot, while `supplyLiquidity()` did not include the incoming lender liquidity in its cap calculation.

Master 6/6 corrects the semantic boundary:

- `supplyCap` limits lender debt-asset liquidity, not collateral custody;
- collateral deposit checks market enabled-state independently;
- `supplyLiquidity()` checks current indexed total supply plus the incoming amount;
- `borrow()` checks only `borrowCap`, so supply-cap growth from interest cannot incorrectly block borrowing;
- a compatibility `validateCaps()` helper remains for integrations that intentionally preflight both caps.

## Existing implementation reused

- indexed lender shares via `totalSupplyShares` and `liquiditySharesOf`;
- exact inbound debt-asset transfer through `_pullExact`;
- RAY supply-index conversion;
- partial withdrawal using ceiling share burn;
- full-claim withdrawal burning all account shares;
- available cash enforcement through `availableLiquidity()`;
- zero amount / zero receiver / claim overflow rejection;
- non-reentrant supply and withdrawal entry points;
- paused-market safe withdrawal behavior.

## Completion evidence

- cumulative Supply Cap regression;
- exact supply/share accounting regression;
- exact receiver withdrawal regression;
- claim and available-liquidity boundaries;
- Master 6/6 static gate;
- complete DEX compile/test CI.

No deployment or production activation is authorized by this change.

`activationAuthorized: false`
