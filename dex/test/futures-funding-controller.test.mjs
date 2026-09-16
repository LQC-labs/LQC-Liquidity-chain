import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { createDemoMarginAccount } from '../app/futures/account-engine.js';
import { createDemoFundingController } from '../app/futures/funding-controller.js';
import { createDemoPositionBook } from '../app/futures/position-book.js';

function openPosition(positionBook, overrides = {}) {
  return positionBook.add({
    symbol: 'BTCUSDT', side: 'LONG', quantity: 0.1, entryPrice: 50000,
    collateral: 1000, leverage: 5, marginMode: 'ISOLATED', ...overrides
  }).position;
}

describe('Futures integrated funding settlement', () => {
  test('persists funding on the exact PositionBook position and debits account', () => {
    const account = createDemoMarginAccount(1000);
    const positionBook = createDemoPositionBook();
    const position = openPosition(positionBook);
    const controller = createDemoFundingController({ account, positionBook });

    const result = controller.settle(position, {
      markPrice: 50500, indexPrice: 50000, maxFundingRate: 0.003,
      timestamp: '2026-09-16T12:00:00.000Z'
    });

    assert.equal(result.payment, -15.15);
    assert.equal(result.position.cumulativeFunding, -15.15);
    assert.equal(positionBook.get(position), result.position);
    assert.equal(result.account.availableBalance, 984.85);
    assert.equal(result.account.cumulativeFunding, -15.15);
    assert.equal(position.cumulativeFunding, 0);
  });

  test('credits a short account without changing reserved margin', () => {
    const account = createDemoMarginAccount(1000);
    account.reserve(200, 'CROSS');
    const before = account.snapshot();
    const positionBook = createDemoPositionBook();
    const position = openPosition(positionBook, { side: 'SHORT', marginMode: 'CROSS' });
    const controller = createDemoFundingController({ account, positionBook });

    const result = controller.settle(position, {
      markPrice: 50500, indexPrice: 50000, maxFundingRate: 0.003
    });

    assert.equal(result.payment, 15.15);
    assert.equal(result.account.crossReserved, before.crossReserved);
    assert.equal(result.account.availableBalance, before.availableBalance + 15.15);
    assert.equal(positionBook.get(position), result.position);
  });

  test('does not mutate account or PositionBook when funding calculation fails', () => {
    const account = createDemoMarginAccount(1000);
    const positionBook = createDemoPositionBook();
    const position = openPosition(positionBook);
    const controller = createDemoFundingController({ account, positionBook });
    const before = account.snapshot();

    assert.throws(() => controller.settle(position, { markPrice: 0, indexPrice: 50000 }), /INVALID_MARK_PRICE/);
    assert.deepEqual(account.snapshot(), before);
    assert.equal(positionBook.get(position), position);
  });

  test('rolls PositionBook back when account funding debit fails', () => {
    const account = createDemoMarginAccount(10);
    const positionBook = createDemoPositionBook();
    const position = openPosition(positionBook);
    const controller = createDemoFundingController({ account, positionBook });
    const before = account.snapshot();

    assert.throws(() => controller.settle(position, {
      markPrice: 50000, indexPrice: 49000, maxFundingRate: 0.003
    }), (error) => {
      assert.equal(error.message, 'FUNDING_ACCOUNT_SETTLEMENT_FAILED');
      assert.equal(error.cause?.message, 'INSUFFICIENT_BALANCE_FOR_FUNDING');
      assert.equal(error.rolledBack, true);
      return true;
    });
    assert.deepEqual(account.snapshot(), before);
    assert.equal(positionBook.get(position), position);
  });

  test('rejects a stale position before changing account or PositionBook', () => {
    const account = createDemoMarginAccount(1000);
    const positionBook = createDemoPositionBook();
    const stale = openPosition(positionBook);
    positionBook.add({ symbol: 'BTCUSDT', side: 'LONG', quantity: 0.01, entryPrice: 51000, collateral: 100, leverage: 5, marginMode: 'ISOLATED' });
    const current = positionBook.get(stale);
    const before = account.snapshot();
    const controller = createDemoFundingController({ account, positionBook });

    assert.throws(() => controller.settle(stale, { markPrice: 50500, indexPrice: 50000 }), /POSITION_CHANGED/);
    assert.deepEqual(account.snapshot(), before);
    assert.equal(positionBook.get(stale), current);
  });
});
