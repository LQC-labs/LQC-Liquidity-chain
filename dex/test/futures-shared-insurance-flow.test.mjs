import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createDemoMarginAccount } from '../app/futures/account-engine.js';
import { createTradingFeeSchedule } from '../app/futures/fee-engine.js';
import { createDemoFeeController } from '../app/futures/fee-controller.js';
import { createInsuranceFund } from '../app/futures/insurance-engine.js';
import { createDemoInsuranceFundService } from '../app/futures/insurance-fund-service.js';
import { createDemoInsuranceAdlController } from '../app/futures/insurance-adl-controller.js';

test('fee insurance share is visible to later liquidation coverage and ADL', () => {
  const insuranceFundService = createDemoInsuranceFundService({
    initialFund: createInsuranceFund({ balance: 10 })
  });
  const account = createDemoMarginAccount(1000);
  const schedule = createTradingFeeSchedule({ makerRate: 0.0002, takerRate: 0.0005 });
  const feeController = createDemoFeeController({
    account,
    schedule,
    feeShares: { insuranceShare: 0.2, treasuryShare: 0.8 },
    insuranceFundService
  });
  const insuranceAdl = createDemoInsuranceAdlController({ insuranceFundService });

  const fee = feeController.settleTrade({ quantity: 0.1, price: 50000, liquidityRole: 'TAKER' });
  assert.equal(fee.insuranceAmount, 0.5);
  assert.equal(insuranceFundService.snapshot().balance, 10.5);
  assert.equal(insuranceAdl.snapshot().balance, 10.5);

  const profitableShort = Object.freeze({
    id: 'global-short-1', side: 'SHORT', quantity: 1, entryPrice: 120, markPrice: 100, collateral: 20
  });
  const resolution = insuranceAdl.coverAndPlan({
    liquidationLoss: 20,
    positions: [profitableShort],
    bankruptSide: 'LONG'
  });

  assert.equal(resolution.insuranceCovered, 10.5);
  assert.equal(resolution.badDebt, 9.5);
  assert.equal(resolution.fund.balance, 0);
  assert.equal(resolution.adlPlan.requiredBadDebt, 9.5);
  assert.equal(resolution.adlPlan.selected[0].id, 'global-short-1');
  assert.equal(resolution.adlPlan.selected[0].absorbAmount, 9.5);
  assert.equal(insuranceFundService.snapshot().balance, 0);
});
