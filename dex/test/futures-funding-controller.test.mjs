import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { createDemoMarginAccount } from '../app/futures/account-engine.js';
import { createDemoFundingController } from '../app/futures/funding-controller.js';

describe('Futures integrated funding settlement', () => {
  test('debits a long account and records funding on the position', () => {
    const account = createDemoMarginAccount(1000);
    const controller = createDemoFundingController({ account });
    const position = Object.freeze({ side: 'LONG', quantity: 0.1, cumulativeFunding: 0 });

    const result = controller.settle(position, {
      markPrice: 50500,
      indexPrice: 50000,
      maxFundingRate: 0.003,
      timestamp: '2026-09-16T12:00:00.000Z'
    });

    assert.equal(result.payment, -15.15);
    assert.equal(result.position.cumulativeFunding, -15.15);
    assert.equal(result.account.availableBalance, 984.85);
    assert.equal(result.account.cumulativeFunding, -15.15);
    assert.equal(position.cumulativeFunding, 0);
  });

  test('credits a short account without changing reserved margin', () => {
    const account = createDemoMarginAccount(1000);
    account.reserve(200, 'CROSS');
    const before = account.snapshot();
    const controller = createDemoFundingController({ account });

    const result = controller.settle(Object.freeze({ side: 'SHORT', quantity: 0.1 }), {
      markPrice: 50500,
      indexPrice: 50000,
      maxFundingRate: 0.003
    });

    assert.equal(result.payment, 15.15);
    assert.equal(result.account.crossReserved, before.crossReserved);
    assert.equal(result.account.availableBalance, before.availableBalance + 15.15);
  });

  test('does not mutate account when funding calculation fails', () => {
    const account = createDemoMarginAccount(1000);
    const controller = createDemoFundingController({ account });
    const before = account.snapshot();

    assert.throws(() => controller.settle({ side: 'LONG', quantity: 1 }, {
      markPrice: 0,
      indexPrice: 50000
    }), /INVALID_MARK_PRICE/);
    assert.deepEqual(account.snapshot(), before);
  });

  test('rejects a funding debit larger than available cash', () => {
    const account = createDemoMarginAccount(10);
    const controller = createDemoFundingController({ account });
    const before = account.snapshot();

    assert.throws(() => controller.settle({ side: 'LONG', quantity: 1 }, {
      markPrice: 50000,
      indexPrice: 49000,
      maxFundingRate: 0.003
    }), /INSUFFICIENT_BALANCE_FOR_FUNDING/);
    assert.deepEqual(account.snapshot(), before);
  });
});
