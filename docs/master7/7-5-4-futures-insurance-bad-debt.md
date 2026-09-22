# Master 7/5-4 — Futures Insurance Fund / Residual Bad Debt

Status: **focused repository implementation gate**

## Purpose

Add the canonical Futures-only loss-absorption boundary after 7/5-3 trading-fee reserve segregation.

This substep reuses the existing Insurance/ADL application specification but adds only the missing on-chain Insurance reserve spending and explicit residual bad-debt accounting.

## Implemented

### Futures Vault

`LQCFuturesVault` now tracks:

- fee-funded `insuranceFeeReserve[token]`;
- cumulative `totalInsuranceCovered[token]`;
- unresolved `residualBadDebt[token]`;
- `isSolvent(token)` in addition to physical `isFullyBacked(token)`.

`coverBadDebt(token, deficit, maxInsuranceCoverage)` is Engine-only and:

1. never covers more than the explicit deficit;
2. never covers more than the Engine-supplied per-event limit;
3. never covers more than the available Insurance reserve;
4. never spends Treasury reserve;
5. records every uncovered remainder as residual bad debt.

Consuming Insurance reserve converts reserved protocol tokens into loss-absorption liquidity; it does not debit user balances.

### Perp Engine

Governance can configure a bounded per-market `maxInsuranceCoverageBps`.

This value is a **limit**, not an approved economic default. Zero disables Insurance spending for that market.

When a full realized loss exceeds locked margin:

1. locked margin absorbs loss first;
2. the remaining deficit is calculated explicitly;
3. Insurance may cover only up to the configured bound and available reserve;
4. any remainder becomes explicit residual bad debt;
5. the Engine emits `PositionDeficitRecorded`.

Voluntary partial reductions that would create a deficit remain blocked until later risk-reducing liquidation/ADL integration.

## Isolation

Insurance and bad debt remain inside the Futures accounting domain.

They do not consume:

- Lending supplier funds;
- Lending reserves;
- LQC Staking principal;
- Staking rewards;
- Treasury fee reserve;
- Funding pool balance.

## Evidence boundary

Passing 7/5-4 means:

**FUTURES-ONLY INSURANCE LOSS COVERAGE + EXPLICIT RESIDUAL BAD DEBT IMPLEMENTED AND FOCUSED-TESTED**

It does not mean:

- bad debt has an ADL resolution path yet;
- partial liquidation is implemented on-chain;
- current Futures Testnet contracts contain this extension;
- market activation is authorized;
- production risk parameters are approved.

`activationAuthorized: false`

## Next

**7/5-5 Partial Liquidation**

Reuse the canonical reduction primitive and integrate Funding + Insurance/bad-debt accounting in one risk-reducing liquidation path.
