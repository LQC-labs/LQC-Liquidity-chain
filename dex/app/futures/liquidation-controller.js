// LQC Flow Futures — DEMO liquidation orchestration boundary.
// Coordinates account-level cross liquidation with the position book so UI
// callers do not mutate shared-risk positions one by one.

export function createDemoLiquidationController({ account, positionBook, markPriceOf, onLiquidated = null }) {
  if (!account || typeof account.liquidateCross !== 'function' || typeof account.health !== 'function') throw new Error('MARGIN_ACCOUNT_REQUIRED');
  if (!positionBook || typeof positionBook.list !== 'function' || typeof positionBook.remove !== 'function') throw new Error('POSITION_BOOK_REQUIRED');
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

    // Settle the shared wallet exactly once before removing positions. This
    // prevents per-position collateral consumption from corrupting cross equity.
    const settlement = account.liquidateCross(positions, markPriceOf);
    const closed = [];
    for (const position of positions) {
      const removed = positionBook.remove({ symbol: position.symbol, side: position.side, marginMode: 'CROSS' });
      if (removed) closed.push(removed);
    }

    const event = Object.freeze({
      liquidated: true,
      reason: 'CROSS_ACCOUNT_LIQUIDATION',
      settlement,
      closedPositions: Object.freeze(closed),
      liquidatedAt: settlement.liquidatedAt
    });
    if (onLiquidated) onLiquidated(event);
    return event;
  }

  return Object.freeze({ evaluateCross, liquidateCrossIfRequired });
}
