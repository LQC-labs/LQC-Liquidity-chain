// LQC Flow Futures — DEMO liquidation orchestration boundary.
// Coordinates account-level cross liquidation with the position book so UI
// callers do not mutate shared-risk positions one by one.

export function createDemoLiquidationController({ account, positionBook, markPriceOf, insuranceAdl = null, adlPositions = null, onLiquidated = null }) {
  if (!account || typeof account.health !== 'function' || typeof account.previewCrossLiquidation !== 'function' || typeof account.commitCrossLiquidation !== 'function') throw new Error('MARGIN_ACCOUNT_REQUIRED');
  if (!positionBook || typeof positionBook.list !== 'function' || typeof positionBook.removeCross !== 'function' || typeof positionBook.restoreCross !== 'function') throw new Error('POSITION_BOOK_REQUIRED');
  if (typeof markPriceOf !== 'function') throw new Error('MARK_PRICE_PROVIDER_REQUIRED');
  if (insuranceAdl !== null && (typeof insuranceAdl.previewCoverAndPlan !== 'function' || typeof insuranceAdl.commitResolution !== 'function')) throw new Error('INSURANCE_ADL_CONTROLLER_REQUIRED');
  if (adlPositions !== null && typeof adlPositions !== 'function') throw new Error('INVALID_ADL_POSITION_PROVIDER');
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

    // Build every failure-prone plan before mutating account, book, or insurance.
    const accountPreview = account.previewCrossLiquidation(positions, markPriceOf);
    let insurancePreview = null;
    if (accountPreview.badDebt > 0) {
      if (!insuranceAdl) throw new Error('BAD_DEBT_RESOLUTION_REQUIRED');
      const sides = [...new Set(positions.map((position) => String(position.side).toUpperCase()))];
      if (sides.length !== 1 || (sides[0] !== 'LONG' && sides[0] !== 'SHORT')) throw new Error('MIXED_SIDE_BAD_DEBT_REQUIRES_ALLOCATION');
      if (!adlPositions) throw new Error('GLOBAL_ADL_POSITION_PROVIDER_REQUIRED');
      const candidates = adlPositions();
      if (!Array.isArray(candidates)) throw new Error('INVALID_ADL_POSITIONS');
      insurancePreview = insuranceAdl.previewCoverAndPlan({
        liquidationLoss: accountPreview.badDebt,
        positions: candidates,
        bankruptSide: sides[0]
      });
    }

    // Remove positions only after all previews succeed. Account commit is guarded
    // against state drift; book is restored if that commit fails.
    const closed = positionBook.removeCross(positions);
    let settlement;
    try {
      settlement = account.commitCrossLiquidation(accountPreview);
    } catch (error) {
      try {
        positionBook.restoreCross(closed);
      } catch (rollbackError) {
        const consistencyError = new Error('CROSS_LIQUIDATION_ROLLBACK_FAILED');
        consistencyError.cause = error;
        consistencyError.rollbackError = rollbackError;
        consistencyError.closedPositions = closed;
        throw consistencyError;
      }
      const settlementError = new Error('CROSS_LIQUIDATION_SETTLEMENT_FAILED');
      settlementError.cause = error;
      settlementError.rolledBack = true;
      throw settlementError;
    }

    let badDebtResolution = null;
    if (insurancePreview) {
      badDebtResolution = insuranceAdl.commitResolution(insurancePreview);
    }

    const event = Object.freeze({
      liquidated: true,
      reason: 'CROSS_ACCOUNT_LIQUIDATION',
      settlement,
      badDebtResolution,
      closedPositions: closed,
      liquidatedAt: settlement.liquidatedAt
    });
    if (onLiquidated) onLiquidated(event);
    return event;
  }

  return Object.freeze({ evaluateCross, liquidateCrossIfRequired });
}
