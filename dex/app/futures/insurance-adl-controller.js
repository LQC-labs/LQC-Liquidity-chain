// LQC Flow Futures — DEMO insurance/ADL orchestration boundary.
// Futures owns bad-debt handling independently of the DEX router.

import { buildAdlPlan } from './adl-engine.js';

export function createDemoInsuranceAdlController({ insuranceFundService }) {
  if (!insuranceFundService || typeof insuranceFundService.snapshot !== 'function' || typeof insuranceFundService.previewCoverage !== 'function' || typeof insuranceFundService.commitCoverage !== 'function') throw new Error('INSURANCE_FUND_SERVICE_REQUIRED');

  function snapshot() {
    return insuranceFundService.snapshot();
  }

  function coverAndPlan({ liquidationLoss, positions = [], bankruptSide }) {
    // Preview insurance coverage first. Do not mutate the shared fund until
    // residual bad debt has a valid ADL plan.
    const coverage = insuranceFundService.previewCoverage(liquidationLoss);
    const plan = coverage.badDebt > 0
      ? buildAdlPlan({ positions, bankruptSide, badDebt: coverage.badDebt })
      : Object.freeze({ requiredBadDebt: 0, selected: Object.freeze([]), residualBadDebt: 0 });

    insuranceFundService.commitCoverage(coverage);

    return Object.freeze({
      requestedLoss: coverage.requestedLoss,
      insuranceCovered: coverage.covered,
      badDebt: coverage.badDebt,
      fullyCovered: coverage.fullyCovered,
      fund: insuranceFundService.snapshot(),
      adlPlan: plan,
      processedAt: new Date().toISOString()
    });
  }

  return Object.freeze({ snapshot, coverAndPlan });
}
