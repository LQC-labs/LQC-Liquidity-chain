// LQC Flow Futures — shared Insurance Fund state boundary.
// Fee settlement and liquidation/ADL orchestration use the same service instance.
// This service remains inside the Futures domain and is not coupled to DEX Router.

import { depositInsurance, coverLiquidationLoss } from './insurance-engine.js';

export function createDemoInsuranceFundService({ initialFund }) {
  if (!initialFund) throw new Error('INSURANCE_FUND_REQUIRED');
  let fund = initialFund;

  function snapshot() {
    return fund;
  }

  function previewDeposit(amount) {
    return Object.freeze({ baseFund: fund, nextFund: depositInsurance(fund, amount) });
  }

  function commitDeposit(preview) {
    if (!preview || !preview.baseFund || !preview.nextFund) throw new Error('INVALID_INSURANCE_DEPOSIT_PREVIEW');
    if (fund !== preview.baseFund) throw new Error('INSURANCE_FUND_CHANGED_SINCE_PREVIEW');
    fund = preview.nextFund;
    return fund;
  }

  function deposit(amount) {
    return commitDeposit(previewDeposit(amount));
  }

  function previewCoverage(loss) {
    const coverage = coverLiquidationLoss(fund, loss);
    return Object.freeze({ ...coverage, baseFund: fund });
  }

  function commitCoverage(coverage) {
    if (!coverage || !coverage.fund || !coverage.baseFund) throw new Error('INVALID_INSURANCE_COVERAGE');
    if (fund !== coverage.baseFund) throw new Error('INSURANCE_FUND_CHANGED_SINCE_PREVIEW');
    fund = coverage.fund;
    return coverage;
  }

  function cover(loss) {
    return commitCoverage(previewCoverage(loss));
  }

  return Object.freeze({
    snapshot,
    previewDeposit,
    commitDeposit,
    deposit,
    previewCoverage,
    commitCoverage,
    cover
  });
}
