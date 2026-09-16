// LQC Flow Futures — DEMO insurance/ADL orchestration boundary.
// Futures owns bad-debt handling independently of the DEX router.

import { coverLiquidationLoss } from './insurance-engine.js';
import { buildAdlPlan } from './adl-engine.js';

export function createDemoInsuranceAdlController({ initialFund }) {
  if (!initialFund) throw new Error('INSURANCE_FUND_REQUIRED');
  let fund = initialFund;

  function snapshot() {
    return fund;
  }

  function coverAndPlan({ liquidationLoss, positions = [], bankruptSide }) {
    // Insurance is always applied before ADL. The ADL engine receives only
    // explicit residual bad debt, never the original liquidation loss.
    const coverage = coverLiquidationLoss(fund, liquidationLoss);
    const plan = coverage.badDebt > 0
      ? buildAdlPlan({ positions, bankruptSide, badDebt: coverage.badDebt })
      : Object.freeze({ requiredBadDebt: 0, selected: Object.freeze([]), residualBadDebt: 0 });

    fund = coverage.fund;
    return Object.freeze({
      requestedLoss: coverage.requestedLoss,
      insuranceCovered: coverage.covered,
      badDebt: coverage.badDebt,
      fullyCovered: coverage.fullyCovered,
      fund,
      adlPlan: plan,
      processedAt: new Date().toISOString()
    });
  }

  return Object.freeze({ snapshot, coverAndPlan });
}
