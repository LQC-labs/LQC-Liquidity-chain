# Master 6/11 — Bad Debt / Reserve Audit

Status: hardening + verification

## Purpose

Verify and harden the existing Lending bad-debt recovery path after Master 6/10 liquidation.

The intended recovery order is:

1. record residual bad debt after collateral exhaustion;
2. preserve ordinary repayment as a risk-reducing recovery path;
3. consume accrued protocol reserves before socializing lender losses;
4. allow governance recapitalization with real debt tokens;
5. allow bounded supplier-loss realization only as a paused-market last resort.

## Existing implementation reused

The current Lending Core already provides:

- per-account `badDebtSharesOf` and per-market `totalBadDebtShares`;
- automatic residual bad-debt recording after liquidation exhausts collateral;
- new-borrow rejection while the account carries bad debt;
- repayment-time bad-debt share clearing;
- accrued protocol reserves from the borrower/supplier interest spread;
- owner-only reserve coverage;
- owner-only external recapitalization;
- disabled-market-only supplier-loss realization;
- cumulative supplier loss bounded to 20% of the historical supply base.

## Gap found in Master 6/11

Two policy rules were previously documented but not enforced by the contract:

- governance could withdraw accrued reserves while bad debt remained;
- governance could socialize supplier loss while accrued reserves still remained.

That allowed the reserve-first recovery order to be bypassed.

## Hardening applied

Master 6/11 adds two fail-closed boundaries:

- `withdrawReserves` reverts with `OutstandingBadDebt` whenever the market still has bad-debt shares;
- `realizeBadDebtLoss` reverts with `ReservesNotExhausted` until accrued protocol reserves are zero.

The existing paused-market requirement and 20% cumulative supplier-loss ceiling remain unchanged.

## Runtime evidence

The Lending EVM regression now proves:

- residual bad debt is recorded after collateral exhaustion;
- accrued reserves can cover bad debt;
- reserves cannot be withdrawn while bad debt remains;
- a borrower with bad debt cannot add new borrow risk even after restoring collateral;
- ordinary third-party repayment reduces recorded bad debt;
- governance recapitalization pulls real debt tokens;
- supplier loss is rejected while the market is active;
- supplier loss is rejected after pause until reserves are exhausted;
- supplier loss remains capped by the existing cumulative 20% limit.

## Reuse decision

No duplicate reserve module, insurance pool, or second bad-debt ledger is introduced.

The existing `LQCLendingCore` bad-debt/reserve accounting remains canonical, with the reserve-priority gaps closed in place.

No deployment, live market mutation, or production activation is authorized.

`activationAuthorized: false`
