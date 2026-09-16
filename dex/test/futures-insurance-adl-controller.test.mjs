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
    assert.equal(result.adlPlan.selected[0].absorbAmount, 50);
    assert.equal(result.adlPlan.residualBadDebt, 0);
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
    assert.equal(result.adlPlan.selected[0].absorbAmount, 100);
    assert.equal(result.adlPlan.residualBadDebt, 50);
  });
});
