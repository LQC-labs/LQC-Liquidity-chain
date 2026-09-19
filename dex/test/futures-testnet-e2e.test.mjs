import assert from 'node:assert/strict';

import { createDemoMarginAccount } from '../app/futures/account-engine.js';
import {
  createEmergencyMarketState,
  evaluateEmergencyTriggers,
  transitionEmergencyState,
  validateEmergencyOrder
} from '../app/futures/emergency-controls.js';
import { createDemoFundingController } from '../app/futures/funding-controller.js';
import { createInsuranceFund } from '../app/futures/insurance-engine.js';
import { createDemoInsuranceFundService } from '../app/futures/insurance-fund-service.js';
import { createDemoInsuranceAdlController } from '../app/futures/insurance-adl-controller.js';
import { createDemoLiquidationController } from '../app/futures/liquidation-controller.js';
import { getFuturesMarket } from '../app/futures/markets.js';
import { createOraclePriceService } from '../app/futures/oracle-price-service.js';
import { buildDemoOrder } from '../app/futures/order-engine.js';
import { createDemoPositionBook } from '../app/futures/position-book.js';
import { markDemoPosition } from '../app/futures/position-engine.js';

function providerFor(sourceMap) {
  return { getSources(symbol) { return sourceMap[symbol] ?? []; } };
}

function approx(actual, expected, epsilon = 1e-10) {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} != ${expected}`);
}

describe('11/9 Futures Testnet E2E', () => {
  it('completes deposit, market/order, funding, increase/reduce, close, and withdrawal accounting', () => {
    const now = 1_800_000_000_000;
    const sources = {
      LQCUSDT: [
        { id: 'a', price: 0.1854, timestamp: now },
        { id: 'b', price: 0.1854, timestamp: now },
        { id: 'c', price: 0.1854, timestamp: now }
      ]
    };
    const oracle = createOraclePriceService({
      sourceProvider: providerFor(sources),
      maxMoveRatio: 0.1,
      maxMarkIndexDeviationRatio: 0.005
    });
    const firstPrice = oracle.refresh('LQCUSDT', { now });
    const market = getFuturesMarket('LQC/USDT');
    assert.equal(market?.symbol, 'LQCUSDT');

    const account = createDemoMarginAccount(1000);
    const positionBook = createDemoPositionBook();
    const openingOrder = buildDemoOrder({
      symbol: market.symbol,
      side: 'LONG',
      type: 'MARKET',
      quantity: 100,
      leverage: 10,
      markPrice: firstPrice.markPrice
    });
    approx(openingOrder.initialMargin, 1.854);
    account.reserve(openingOrder.initialMargin, 'ISOLATED');
    let current = positionBook.add({
      symbol: openingOrder.symbol,
      side: openingOrder.side,
      quantity: openingOrder.quantity,
      entryPrice: openingOrder.referencePrice,
      leverage: openingOrder.leverage,
      collateral: openingOrder.initialMargin,
      marginMode: 'ISOLATED'
    }).position;

    sources.LQCUSDT = [
      { id: 'a', price: 0.19, timestamp: now + 1000 },
      { id: 'b', price: 0.19, timestamp: now + 1000 },
      { id: 'c', price: 0.19, timestamp: now + 1000 }
    ];
    const moved = oracle.refresh('LQCUSDT', { now: now + 1000 });
    assert.equal(moved.indexPrice, 0.19);
    assert.ok(moved.markIndexDeviationRatio <= 0.005 + Number.EPSILON);

    const funding = createDemoFundingController({ account, positionBook }).settle(current, {
      markPrice: moved.markPrice,
      indexPrice: moved.indexPrice,
      timestamp: '2027-01-15T08:00:00.000Z'
    });
    current = funding.position;
    assert.ok(funding.payment > 0);
    assert.ok(markDemoPosition(current, moved.markPrice).unrealizedPnl > 0);

    const increaseOrder = buildDemoOrder({
      symbol: market.symbol,
      side: 'LONG',
      type: 'LIMIT',
      quantity: 50,
      price: 0.19,
      leverage: 10
    });
    account.reserve(increaseOrder.initialMargin, 'ISOLATED');
    current = positionBook.add({
      symbol: increaseOrder.symbol,
      side: increaseOrder.side,
      quantity: increaseOrder.quantity,
      entryPrice: increaseOrder.referencePrice,
      leverage: increaseOrder.leverage,
      collateral: increaseOrder.initialMargin,
      marginMode: 'ISOLATED'
    }).position;
    assert.equal(current.quantity, 150);

    const partial = positionBook.reduce(current, 50);
    const partialPnl = (moved.markPrice - partial.previous.entryPrice) * 50;
    account.release(partial.releasedCollateral, partialPnl, 'ISOLATED');
    current = partial.position;
    assert.equal(current.quantity, 100);

    const closing = positionBook.reduce(current, current.quantity);
    const closingPnl = (moved.markPrice - closing.previous.entryPrice) * closing.previous.quantity;
    const withdrawn = account.release(closing.releasedCollateral, closingPnl, 'ISOLATED');

    assert.equal(positionBook.list().length, 0);
    approx(withdrawn.totalReserved, 0);
    approx(
      withdrawn.availableBalance,
      withdrawn.initialBalance + funding.payment + partialPnl + closingPnl
    );
  });

  it('halts on a stale oracle and requires staged, approved recovery', () => {
    const now = 1_800_000_000_000;
    const oracle = createOraclePriceService({
      sourceProvider: providerFor({
        LQCUSDT: [
          { id: 'a', price: 0.1854, timestamp: now },
          { id: 'b', price: 0.1854, timestamp: now },
          { id: 'c', price: 0.1854, timestamp: now }
        ]
      }),
      maxReadAgeMs: 1000
    });
    oracle.refresh('LQCUSDT', { now });
    const staleAt = now + 1001;
    const status = oracle.getStatus('LQCUSDT', { now: staleAt });
    assert.equal(status.stale, true);
    assert.equal(oracle.getMarkPrice('LQCUSDT', { now: staleAt }), null);

    const trigger = evaluateEmergencyTriggers({ oracleHealthy: status.healthy });
    assert.deepEqual(trigger, { state: 'HALTED', reason: 'ORACLE_UNHEALTHY' });
    let state = createEmergencyMarketState({ ...trigger, updatedAt: '2027-01-15T08:00:01.001Z' });
    assert.throws(() => validateEmergencyOrder(state, {}), /MARKET_HALTED/);
    assert.throws(() => transitionEmergencyState(state, {
      nextState: 'ACTIVE',
      timestamp: '2027-01-15T08:00:02.000Z',
      recoveryApproved: true
    }), /STAGED_RECOVERY_REQUIRED/);

    state = transitionEmergencyState(state, {
      nextState: 'REDUCE_ONLY',
      reason: 'ORACLE_RECOVERING',
      timestamp: '2027-01-15T08:00:02.000Z'
    });
    assert.equal(validateEmergencyOrder(state, {
      reduceOnly: true,
      positionSide: 'LONG',
      positionQuantity: 100,
      orderSide: 'SHORT',
      orderQuantity: 100
    }).allowed, true);

    state = transitionEmergencyState(state, {
      nextState: 'ACTIVE',
      timestamp: '2027-01-15T08:00:03.000Z',
      recoveryApproved: true
    });
    assert.equal(state.state, 'ACTIVE');
  });

  it('liquidates a breached cross account and reconciles insurance plus ADL accounting', () => {
    const account = createDemoMarginAccount(20);
    const positionBook = createDemoPositionBook();
    account.reserve(20, 'CROSS');
    positionBook.add({
      symbol: 'BTCUSDT',
      side: 'LONG',
      quantity: 1,
      entryPrice: 100,
      leverage: 5,
      collateral: 20,
      marginMode: 'CROSS'
    });

    const insuranceFundService = createDemoInsuranceFundService({
      initialFund: createInsuranceFund({ balance: 4 })
    });
    const insuranceAdl = createDemoInsuranceAdlController({ insuranceFundService });
    const adlCandidate = Object.freeze({
      id: 'global-profitable-short',
      side: 'SHORT',
      quantity: 1,
      entryPrice: 100,
      markPrice: 70,
      collateral: 10
    });
    const liquidations = [];
    const controller = createDemoLiquidationController({
      account,
      positionBook,
      markPriceOf: () => 70,
      insuranceAdl,
      adlPositions: () => [adlCandidate],
      onLiquidated: (event) => liquidations.push(event)
    });

    const before = controller.evaluateCross();
    assert.equal(before.liquidatable, true);
    assert.equal(before.equity, -10);

    const result = controller.liquidateCrossIfRequired();
    const resolution = result.badDebtResolution;
    assert.equal(result.liquidated, true);
    assert.equal(result.closedPositions.length, 1);
    assert.equal(positionBook.list().length, 0);
    assert.equal(account.snapshot().crossReserved, 0);
    assert.equal(account.snapshot().availableBalance, 0);
    assert.equal(resolution.requestedLoss, 10);
    assert.equal(resolution.insuranceCovered, 4);
    assert.equal(resolution.badDebt, 6);
    assert.equal(resolution.fund.balance, 0);
    assert.equal(resolution.adlPlan.requiredBadDebt, 6);
    assert.equal(resolution.adlPlan.selected.length, 1);
    assert.equal(resolution.adlPlan.selected[0].absorbAmount, 6);
    assert.equal(resolution.adlPlan.residualBadDebt, 0);
    assert.equal(liquidations.length, 1);
    approx(resolution.insuranceCovered + resolution.adlPlan.selected[0].absorbAmount, 10);
  });
});
