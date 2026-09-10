import assert from "node:assert/strict";
import { aggregateCandles, approvedPool, createIndexerCheckpoint, restoreIndexerCheckpoint, swapToTrade } from "../scripts/candle-indexer-core.mjs";

describe("LQC Flow candle indexer", function () {
  const token0 = "0x0000000000000000000000000000000000000001", token1 = "0x0000000000000000000000000000000000000002";
  it("derives both pair orientations from one exact Swap event", function () {
    const swap = { amount0In: 2n * 10n ** 18n, amount1In: 0n, amount0Out: 0n, amount1Out: 6n * 10n ** 6n };
    const forward = swapToTrade(swap, { token0, base: token0, baseDecimals: 18, quoteDecimals: 6 }, 120);
    const reverse = swapToTrade(swap, { token0, base: token1, baseDecimals: 6, quoteDecimals: 18 }, 120);
    assert.equal(forward.price, 3); assert.equal(forward.baseVolume, 2);
    assert.equal(reverse.price, 1 / 3); assert.equal(reverse.baseVolume, 6);
  });
  it("builds deterministic OHLCV buckets in timestamp order", function () {
    const candles = aggregateCandles([
      { timestamp: 125, price: 3, baseVolume: 2 }, { timestamp: 61, price: 2, baseVolume: 1 },
      { timestamp: 110, price: 4, baseVolume: 3 }, { timestamp: 121, price: 2.5, baseVolume: 4 }
    ], "1m");
    assert.deepEqual(candles, [
      { time: 60, open: 2, high: 4, low: 2, close: 4, volume: 4 },
      { time: 120, open: 2.5, high: 3, low: 2.5, close: 3, volume: 6 }
    ]);
  });
  it("allows only pools pinned in the deployment record", function () {
    const deployment = { pools: [{ address: token0 }] };
    assert.equal(approvedPool(deployment, token0.toUpperCase()), true);
    assert.equal(approvedPool(deployment, token1), false);
  });
  it("restores a bounded checkpoint only for the exact approved pool identity", function () {
    const trades = [
      { base: token0, quote: token1, timestamp: 60, price: 2, baseVolume: 1, quoteVolume: 2 },
      { base: token1, quote: token0, timestamp: 60, price: 0.5, baseVolume: 2, quoteVolume: 1 }
    ];
    const source = [{ address: token0, token0, token1, trades }];
    const checkpoint = createIndexerCheckpoint(123, source, 1);
    const target = [{ address: token0, token0, token1, trades: [] }];
    assert.equal(restoreIndexerCheckpoint(checkpoint, target, 1), 123);
    assert.deepEqual(target[0].trades, trades.slice(-1));
    assert.throws(() => restoreIndexerCheckpoint({ ...checkpoint, chainId: 56 }, target), /incompatible/);
    assert.throws(() => restoreIndexerCheckpoint(checkpoint, [{ address: token0, token0: token1, token1, trades: [] }]), /approved pools/);
  });
});
