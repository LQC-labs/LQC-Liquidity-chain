import assert from "node:assert/strict";
import { calculateDeviationBps, enforceCrossSourceDeviation, normalizePositivePrice, NORMALIZED_PRICE_SCALE } from "../scripts/futures-oracle-cross-source-deviation.mjs";

describe("Futures oracle cross-source deviation gate", function () {
  it("normalizes feeds with different decimals without floating point", function () {
    assert.equal(normalizePositivePrice(50_000n * 10n ** 8n, 8), 50_000n * NORMALIZED_PRICE_SCALE);
    assert.equal(normalizePositivePrice(50_000n * 10n ** 6n, 6), 50_000n * NORMALIZED_PRICE_SCALE);
  });

  it("passes bounded deviation but never authorizes activation", function () {
    const result = enforceCrossSourceDeviation({
      primaryAnswer: 50_000n * 10n ** 8n, primaryDecimals: 8,
      referenceAnswer: 49_900n * 10n ** 6n, referenceDecimals: 6,
      maxDeviationBps: 200,
    });
    assert.equal(result.status, "READ_ONLY_CROSS_SOURCE_DEVIATION_PASS");
    assert.equal(result.activationAuthorized, false);
    assert.equal(result.deviationBps, "21");
  });

  it("fails closed when normalized prices exceed the configured deviation", function () {
    assert.throws(() => enforceCrossSourceDeviation({
      primaryAnswer: 51_100n * 10n ** 8n, primaryDecimals: 8,
      referenceAnswer: 50_000n * 10n ** 18n, referenceDecimals: 18,
      maxDeviationBps: 200,
    }), /exceeds maximum/);
  });

  it("rounds deviation upward at the boundary", function () {
    assert.equal(calculateDeviationBps(10_001n, 10_000n), 1n);
    assert.equal(calculateDeviationBps(10_000n, 10_000n), 0n);
  });

  it("rejects non-positive prices, invalid decimals and unsafe bounds", function () {
    assert.throws(() => normalizePositivePrice(0n, 8), /positive/);
    assert.throws(() => normalizePositivePrice(1n, 37), /decimals/);
    assert.throws(() => enforceCrossSourceDeviation({primaryAnswer:1n,primaryDecimals:36,referenceAnswer:1n,referenceDecimals:0,maxDeviationBps:200}), /rounds to zero/);
    assert.throws(() => enforceCrossSourceDeviation({primaryAnswer:1n,primaryDecimals:0,referenceAnswer:1n,referenceDecimals:0,maxDeviationBps:5001}), /between 1 and 5000/);
  });
});
