// LQC Flow Futures — DEMO liquidation orchestration boundary.
// Coordinates account-level cross liquidation with the position book so UI
// callers do not mutate shared-risk positions one by one.

export function createDemoLiquidationController({ account, positionBook, markPriceOf, onLiquidated = null }) {
  if (!account || typeof account.liquidateCross !== 'function' || typeof account.health !== 'function') throw new Error('MARGIN_ACCOUNT_REQUIRED');
  if (!positionBook || typeof positionBook.list !== 'function' || typeof positionBook.removeCross !== 'function') throw new Error('POSITION_BOOK_REQUIRED');
  if (typeof markPriceOf !== 'function') throw new Error('MARK_PRICE_PROVIDER_REQUIRED');
  if (onLiquidated !== null && typeof onLiquidated !== 'function') throw new Error('INVALID_LIQUIDATION_CALLBACK');

  function crossPositions() {
    return positionBook.list().filter((position) => position.marginMode === 'CROSS');
  }

  function evaluateCross() {
    return account.health(crossPositions(), markPriceOf);
  }

  function liquidateCrossIfRequired() {
    const positions = crossPositions();
    if (!positions.length) return Object.freeze({ liquidated: false, reason: 'NO_CROSS_POSITIONS' });

    const health = account.health(positions, markPriceOf);
    if (!health.liquidatable) return Object.freeze({ liquidated: false, reason: 'ACCOUNT_HEALTHY', health });

    // Remove the exact risk-evaluated set before account settlement. removeCross
    // validates that the shared-risk set did not change between evaluation and
    // mutation, preventing settlement against a stale position snapshot.
    const closed = positionBook.removeCross(positions);
    let settlement;
    try {
      settlement = account.liquidateCross(positions, markPriceOf);
    } catch (error) {
      // The demo position book has no transactional rollback API. Failing after
      // removal is therefore surfaced as a hard consistency error instead of
      // silently continuing with a partially settled liquidation.
      const consistencyError = new Error('CROSS_LIQUIDATION_SETTLEMENT_FAILED');
      consistencyError.cause = error;
      consistencyError.closedPositions = closed;
      throw consistencyError;
    }

    const event = Object.freeze({
      liquidated: true,
      reason: 'CROSS_ACCOUNT_LIQUIDATION',
      settlement,
      closedPositions: closed,
      liquidatedAt: settlement.liquidatedAt
    });
    if (onLiquidated) onLiquidated(event);
    return event;
  }

  return Object.freeze({ evaluateCross, liquidateCrossIfRequired });
}
