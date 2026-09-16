import assert from "node:assert/strict";
import { describe, it } from "mocha";
import { validateOracleSources, priceCircuitBreaker } from "../app/futures/oracle-guard.js";

describe("LQC Flow Futures oracle guard", function () {
  const now = 1_800_000_000_000;

  it("aggregates fresh agreeing sources by median", function () {
    const result = validateOracleSources([
      { id: "a", price: 50_000, timestamp: now - 1_000 },
      { id: "b", price: 50_100, timestamp: now - 2_000 },
      { id: "c", price: 49_950, timestamp: now - 3_000 }
    ], { now, maxDeviationRatio: 0.01 });
    assert.equal(result.price, 50_000);
    assert.equal(result.accepted.length, 3);
  });

  it("rejects stale sources and requires a fresh quorum", function () {
    assert.throws(() => validateOracleSources([
      { id: "a", price: 50_000, timestamp: now - 31_000 },
      { id: "b", price: 50_010, timestamp: now - 1_000 }
    ], { now, maxAgeMs: 30_000 }), /INSUFFICIENT_FRESH_ORACLE_SOURCES/);
  });

  it("rejects duplicate source ids so one feed cannot satisfy quorum twice", function () {
    assert.throws(() => validateOracleSources([
      { id: "a", price: 50_000, timestamp: now },
      { id: "a", price: 50_010, timestamp: now }
    ], { now }), /DUPLICATE_ORACLE_SOURCE_ID/);
  });

  it("filters a deviating source while retaining a healthy quorum", function () {
    const result = validateOracleSources([
      { id: "a", price: 50_000, timestamp: now },
      { id: "b", price: 50_050, timestamp: now },
      { id: "outlier", price: 60_000, timestamp: now }
    ], { now, maxDeviationRatio: 0.02 });
    assert.equal(result.accepted.length, 2);
    assert.equal(result.rejectedCount, 1);
  });

  it("blocks market data when source deviation destroys quorum", function () {
    assert.throws(() => validateOracleSources([
      { id: "a", price: 40_000, timestamp: now },
      { id: "b", price: 50_000, timestamp: now },
      { id: "c", price: 60_000, timestamp: now }
    ], { now, maxDeviationRatio: 0.01 }), /ORACLE_PRICE_DEVIATION_TOO_HIGH/);
  });

  it("trips the price circuit breaker on an excessive single-step move", function () {
    assert.equal(priceCircuitBreaker({ previousPrice: 50_000, nextPrice: 54_000, maxMoveRatio: 0.1 }).allowed, true);
    assert.equal(priceCircuitBreaker({ previousPrice: 50_000, nextPrice: 56_000, maxMoveRatio: 0.1 }).allowed, false);
  });
});
