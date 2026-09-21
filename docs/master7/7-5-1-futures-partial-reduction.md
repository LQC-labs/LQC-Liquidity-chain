# Master 7/5-1 — Futures Canonical Partial Position Reduction

Status: **7/5 substep repository gate**

## Purpose

Implement the first dependency in the confirmed 7/5 order: one canonical on-chain position-reduction primitive.

The existing application-layer `reduceDemoPosition` behavior is used as specification evidence. The on-chain Engine is extended rather than replaced.

## Implemented

`LQCPerpEngine.reducePosition(marketId, reduceSizeUsd)` now:

- accepts bounded partial or full reduction;
- reads the same fail-closed Oracle price used by the existing Engine;
- realizes PnL only on the reduced notional;
- releases margin in the same proportion as reduced notional;
- preserves the remaining position entry price and side;
- updates remaining `sizeUsd` and `margin` atomically;
- prevents zero-size/over-size reduction;
- uses the same primitive for legacy full `closePosition`;
- emits explicit `PositionReduced` accounting evidence.

## Temporary deficit boundary

A voluntary **partial** reduction that would produce zero/negative equity on the reduced slice is rejected for now.

Reason: the canonical on-chain Insurance / residual bad-debt path is deliberately scheduled later in 7/5. Allowing the partial reducer to externalize deficit before that accounting exists would create an untracked loss.

Full close and existing liquidation retain their historical behavior until the later Insurance/bad-debt and partial-liquidation substeps intentionally replace that boundary.

## Accounting invariants

For a partial reduction:

`releasedMargin = oldMargin × reducedSize / oldSize`

`realizedPnl = PnL(reducedSize, originalEntryPrice, currentOraclePrice)`

The remaining position keeps:

- original entry price;
- original side;
- `remainingSize = oldSize - reducedSize`;
- `remainingMargin = oldMargin - releasedMargin`.

No Futures state is coupled to Lending or LQC Staking.

## Not implemented in 7/5-1

Still pending in this same Master 7/5 stage:

1. **7/5-2 Funding checkpoint/accounting**
2. **7/5-3 Trading fee accounting + reserve routing**
3. **7/5-4 Futures Insurance Fund / residual bad debt**
4. **7/5-5 Partial liquidation using the reduction primitive**
5. **7/5-6 Bounded ADL primitive**
6. **7/5-7 Integrated accounting regression/invariants**

No Testnet transaction, redeployment, market activation or user-fund action is authorized.

`activationAuthorized: false`

## Next

**7/5-2 Funding checkpoint/accounting**
