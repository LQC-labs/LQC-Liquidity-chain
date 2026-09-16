// LQC Flow Futures — DEMO funding settlement orchestration.
// Coordinates deterministic funding calculations with account cash settlement
// and guarded PositionBook persistence.

import { settleDemoFunding } from './funding-engine.js';

export function createDemoFundingController({ account, positionBook }) {
  if (!account || typeof account.settleFunding !== 'function') throw new Error('MARGIN_ACCOUNT_REQUIRED');
  if (!positionBook || typeof positionBook.get !== 'function' || typeof positionBook.replace !== 'function') throw new Error('POSITION_BOOK_REQUIRED');

  function settle(position, fundingInput) {
    if (!position) throw new Error('POSITION_REQUIRED');

    // Funding must target the exact current PositionBook object. This prevents
    // stale callers from settling cash against a position that changed meanwhile.
    const current = positionBook.get(position);
    if (!current) throw new Error('NO_POSITION_TO_SETTLE_FUNDING');
    if (current !== position) throw new Error('POSITION_CHANGED');

    // Calculate and validate before any state mutation.
    const funding = settleDemoFunding(position, fundingInput);

    // Guarded replacement is performed before account settlement. If it fails,
    // account cash remains untouched. Account settlement is expected to fail only
    // on insufficient cash for a debit; restore the previous position in that case.
    const persisted = positionBook.replace(position, funding.position);
    let accountSnapshot;
    try {
      accountSnapshot = account.settleFunding(funding.payment);
    } catch (error) {
      try {
        positionBook.replace(persisted.position, persisted.previous);
      } catch (rollbackError) {
        const consistencyError = new Error('FUNDING_POSITION_ROLLBACK_FAILED');
        consistencyError.cause = error;
        consistencyError.rollbackError = rollbackError;
        throw consistencyError;
      }
      const settlementError = new Error('FUNDING_ACCOUNT_SETTLEMENT_FAILED');
      settlementError.cause = error;
      settlementError.rolledBack = true;
      throw settlementError;
    }

    return Object.freeze({
      position: persisted.position,
      fundingRate: funding.fundingRate,
      payment: funding.payment,
      account: accountSnapshot,
      settledAt: persisted.position.lastFundingAt
    });
  }

  return Object.freeze({ settle });
}
