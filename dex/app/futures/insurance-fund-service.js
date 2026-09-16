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
    return depositInsurance(fund, amount);
  }

  function commitDeposit(nextFund) {
    if (!nextFund) throw new Error('INSURANCE_FUND_REQUIRED');
    fund = nextFund;
    return fund;
  }

  function deposit(amount) {
    return commitDeposit(previewDeposit(amount));
  }

  function cover(loss) {
    const coverage = coverLiquidationLoss(fund, loss);
    fund = coverage.fund;
    return coverage;
  }

  return Object.freeze({ snapshot, previewDeposit, commitDeposit, deposit, cover });
}
