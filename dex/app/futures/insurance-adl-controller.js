// LQC Flow Futures — DEMO insurance/ADL orchestration boundary.
// Futures owns bad-debt handling independently of the DEX router.

import { buildAdlPlan } from './adl-engine.js';

export function createDemoInsuranceAdlController({ insuranceFundService }) {
  if (!insuranceFundService || typeof insuranceFundService.snapshot !== 'function' || typeof insuranceFundService.previewCoverage !== 'function' || typeof insuranceFundService.commitCoverage !== 'function') throw new Error('INSURANCE_FUND_SERVICE_REQUIRED');

  function snapshot() {
    return insuranceFundService.snapshot();
  }

  function previewCoverAndPlan({ liquidationLoss, positions = [], bankruptSide }) {
    // Build the complete bad-debt resolution without mutating the shared fund.
    // The caller may now validate account/book state before committing anything.
    const fundBefore = insuranceFundService.snapshot();
    const coverage = insuranceFundService.previewCoverage(liquidationLoss);
    const plan = coverage.badDebt > 0
      ? buildAdlPlan({ positions, bankruptSide, badDebt: coverage.badDebt })
      : Object.freeze({ requiredBadDebt: 0, selected: Object.freeze([]), residualBadDebt: 0 });

    return Object.freeze({
      requestedLoss: coverage.requestedLoss,
      insuranceCovered: coverage.covered,
      badDebt: coverage.badDebt,
      fullyCovered: coverage.fullyCovered,
      coverage,
      fundBefore,
      adlPlan: plan
    });
  }

  function commitResolution(preview) {
    if (!preview || !preview.coverage || !preview.fundBefore) throw new Error('INSURANCE_ADL_PREVIEW_REQUIRED');
    const current = insuranceFundService.snapshot();
    if (current.balance !== preview.fundBefore.balance) throw new Error('INSURANCE_FUND_CHANGED_SINCE_PREVIEW');

    insuranceFundService.commitCoverage(preview.coverage);
    return Object.freeze({
      requestedLoss: preview.requestedLoss,
      insuranceCovered: preview.insuranceCovered,
      badDebt: preview.badDebt,
      fullyCovered: preview.fullyCovered,
      fund: insuranceFundService.snapshot(),
      adlPlan: preview.adlPlan,
      processedAt: new Date().toISOString()
    });
  }

  function coverAndPlan(input) {
    return commitResolution(previewCoverAndPlan(input));
  }

  return Object.freeze({ snapshot, previewCoverAndPlan, commitResolution, coverAndPlan });
}
