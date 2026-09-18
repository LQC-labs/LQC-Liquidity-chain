import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { createInsuranceFund } from '../app/futures/insurance-engine.js';
import { createDemoInsuranceFundService } from '../app/futures/insurance-fund-service.js';
import { createDemoInsuranceAdlController } from '../app/futures/insurance-adl-controller.js';

const profitableShort = Object.freeze({ id: 'short-1', side: 'SHORT', quantity: 1, entryPrice: 120, markPrice: 100, collateral: 20 });
const profitableLong = Object.freeze({ id: 'long-1', side: 'LONG', quantity: 1, entryPrice: 80, markPrice: 100, collateral: 20 });
const service = (options) => createDemoInsuranceFundService({ initialFund: createInsuranceFund(options) });

describe('Futures insurance and ADL orchestration', () => {
  test('fully covers liquidation loss without invoking ADL', () => {
    const insuranceFundService = service({ balance: 100 });
    const controller = createDemoInsuranceAdlController({ insuranceFundService });
    const result = controller.coverAndPlan({ liquidationLoss: 40, positions: [profitableShort], bankruptSide: 'LONG' });
    assert.equal(result.insuranceCovered, 40);
    assert.equal(result.badDebt, 0);
    assert.equal(result.fund.balance, 60);
    assert.equal(insuranceFundService.snapshot().balance, 60);
    assert.equal(result.adlPlan.requiredBadDebt, 0);
    assert.deepEqual(result.adlPlan.selected, []);
  });

  test('passes only residual bad debt to ADL after insurance is exhausted', () => {
    const insuranceFundService = service({ balance: 30 });
    const controller = createDemoInsuranceAdlController({ insuranceFundService });
    const result = controller.coverAndPlan({ liquidationLoss: 80, positions: [profitableShort], bankruptSide: 'LONG' });
    assert.equal(result.insuranceCovered, 30);
    assert.equal(result.badDebt, 50);
    assert.equal(result.fund.balance, 0);
    assert.equal(result.adlPlan.requiredBadDebt, 50);
    assert.equal(result.adlPlan.selected[0].id, 'short-1');
    assert.equal(result.adlPlan.selected[0].availableProfit, 20);
    assert.equal(result.adlPlan.selected[0].absorbAmount, 20);
    assert.equal(result.adlPlan.selected[0].reduceQuantity, 1);
    assert.equal(result.adlPlan.selected[0].remainingQuantity, 0);
    assert.equal(result.adlPlan.residualBadDebt, 30);
  });

  test('respects per-event insurance coverage cap before ADL', () => {
    const insuranceFundService = service({ balance: 100, maxCoveragePerEvent: 25 });
    const controller = createDemoInsuranceAdlController({ insuranceFundService });
    const result = controller.coverAndPlan({ liquidationLoss: 60, positions: [profitableLong], bankruptSide: 'SHORT' });
    assert.equal(result.insuranceCovered, 25);
    assert.equal(result.badDebt, 35);
    assert.equal(result.fund.balance, 75);
    assert.equal(result.adlPlan.requiredBadDebt, 35);
    assert.equal(result.adlPlan.selected[0].id, 'long-1');
  });

  test('keeps explicit residual debt when ADL liquidity is insufficient', () => {
    const insuranceFundService = service({ balance: 0 });
    const controller = createDemoInsuranceAdlController({ insuranceFundService });
    const result = controller.coverAndPlan({ liquidationLoss: 150, positions: [profitableShort], bankruptSide: 'LONG' });
    assert.equal(result.badDebt, 150);
    assert.equal(result.adlPlan.selected[0].availableProfit, 20);
    assert.equal(result.adlPlan.selected[0].absorbAmount, 20);
    assert.equal(result.adlPlan.selected[0].reduceQuantity, 1);
    assert.equal(result.adlPlan.selected[0].remainingQuantity, 0);
    assert.equal(result.adlPlan.residualBadDebt, 130);
  });

  test('does not consume insurance fund when ADL planning fails', () => {
    const insuranceFundService = service({ balance: 30 });
    const controller = createDemoInsuranceAdlController({ insuranceFundService });
    const before = insuranceFundService.snapshot();
    assert.throws(() => controller.coverAndPlan({ liquidationLoss: 80, positions: [profitableShort], bankruptSide: 'INVALID' }), /INVALID_SIDE/);
    assert.deepEqual(insuranceFundService.snapshot(), before);
  });

  test('rejects stale coverage preview after another fund mutation', () => {
    const insuranceFundService = service({ balance: 100 });
    const stale = insuranceFundService.previewCoverage(40);
    insuranceFundService.deposit(10);
    assert.throws(() => insuranceFundService.commitCoverage(stale), /INSURANCE_FUND_CHANGED_SINCE_PREVIEW/);
    assert.equal(insuranceFundService.snapshot().balance, 110);
  });

  test('rejects stale deposit preview after another fund mutation', () => {
    const insuranceFundService = service({ balance: 100 });
    const stale = insuranceFundService.previewDeposit(10);
    insuranceFundService.cover(20);
    assert.throws(() => insuranceFundService.commitDeposit(stale), /INSURANCE_FUND_CHANGED_SINCE_PREVIEW/);
    assert.equal(insuranceFundService.snapshot().balance, 80);
  });
});
