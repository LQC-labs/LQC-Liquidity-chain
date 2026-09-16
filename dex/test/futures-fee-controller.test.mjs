import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { createDemoMarginAccount } from '../app/futures/account-engine.js';
import { createDemoFeeController } from '../app/futures/fee-controller.js';
import { createTradingFeeSchedule } from '../app/futures/fee-engine.js';

describe('Futures integrated trading fee settlement', () => {
  const schedule = createTradingFeeSchedule({ makerRate: 0.0002, takerRate: 0.0005 });

  test('debits maker fee from Futures account', () => {
    const account = createDemoMarginAccount(1000);
    const controller = createDemoFeeController({ account, schedule });
    const result = controller.settleTrade({ quantity: 0.1, price: 50000, liquidityRole: 'MAKER' });

    assert.equal(result.fee, 1);
    assert.equal(result.account.availableBalance, 999);
    assert.equal(result.account.cumulativeTradingFees, 1);
  });

  test('splits taker fee between insurance and treasury without changing total debit', () => {
    const account = createDemoMarginAccount(1000);
    const controller = createDemoFeeController({
      account,
      schedule,
      feeShares: { insuranceShare: 0.2, treasuryShare: 0.8 }
    });
    const result = controller.settleTrade({ quantity: 0.1, price: 50000, liquidityRole: 'TAKER' });

    assert.equal(result.fee, 2.5);
    assert.equal(result.insuranceAmount, 0.5);
    assert.equal(result.treasuryAmount, 2);
    assert.equal(result.account.availableBalance, 997.5);
  });

  test('keeps reserved margin unchanged when charging a trading fee', () => {
    const account = createDemoMarginAccount(1000);
    account.reserve(200, 'CROSS');
    const before = account.snapshot();
    const controller = createDemoFeeController({ account, schedule });
    const result = controller.settleTrade({ quantity: 0.1, price: 50000, liquidityRole: 'MAKER' });

    assert.equal(result.account.crossReserved, before.crossReserved);
    assert.equal(result.account.availableBalance, before.availableBalance - 1);
  });

  test('does not mutate account when fee calculation fails', () => {
    const account = createDemoMarginAccount(1000);
    const controller = createDemoFeeController({ account, schedule });
    const before = account.snapshot();

    assert.throws(() => controller.settleTrade({ quantity: 0, price: 50000, liquidityRole: 'TAKER' }), /INVALID_TRADE_QUANTITY/);
    assert.deepEqual(account.snapshot(), before);
  });

  test('rejects a fee debit larger than available cash', () => {
    const account = createDemoMarginAccount(1);
    const controller = createDemoFeeController({ account, schedule });
    const before = account.snapshot();

    assert.throws(() => controller.settleTrade({ quantity: 1, price: 50000, liquidityRole: 'TAKER' }), /INSUFFICIENT_BALANCE_FOR_TRADING_FEE/);
    assert.deepEqual(account.snapshot(), before);
  });
});
