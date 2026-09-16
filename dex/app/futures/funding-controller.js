// LQC Flow Futures — DEMO funding settlement orchestration.
// Coordinates deterministic funding calculations with account cash settlement.

import { settleDemoFunding } from './funding-engine.js';

export function createDemoFundingController({ account }) {
  if (!account || typeof account.settleFunding !== 'function') throw new Error('MARGIN_ACCOUNT_REQUIRED');

  function settle(position, fundingInput) {
    if (!position) throw new Error('POSITION_REQUIRED');

    // Calculate the position update before mutating account state. This keeps
    // validation/calculation failures from partially changing account cash.
    const funding = settleDemoFunding(position, fundingInput);
    const accountSnapshot = account.settleFunding(funding.payment);

    return Object.freeze({
      position: funding.position,
      fundingRate: funding.fundingRate,
      payment: funding.payment,
      account: accountSnapshot,
      settledAt: funding.position.lastFundingAt
    });
  }

  return Object.freeze({ settle });
}
