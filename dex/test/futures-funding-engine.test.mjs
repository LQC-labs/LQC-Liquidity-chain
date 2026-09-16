import assert from "node:assert/strict";
import { describe, it } from "mocha";
import {
  calculateFundingRate,
  calculateFundingPayment,
  settleDemoFunding
} from "../app/futures/funding-engine.js";

describe("LQC Flow Futures funding engine", function () {
  it("charges longs and credits shorts when mark trades above index", function () {
    const rate = calculateFundingRate({ markPrice: 50_500, indexPrice: 50_000 });
    assert.equal(rate, 0.003, "premium should be capped by the funding limit");
    assert.equal(calculateFundingPayment({ side: "LONG", quantity: 0.1, markPrice: 50_500, fundingRate: rate }), -15.15);
    assert.equal(calculateFundingPayment({ side: "SHORT", quantity: 0.1, markPrice: 50_500, fundingRate: rate }), 15.15);
  });

  it("charges shorts when mark trades below index", function () {
    const rate = calculateFundingRate({ markPrice: 49_950, indexPrice: 50_000, maxFundingRate: 0.01 });
    assert.ok(rate < 0);
    const shortPayment = calculateFundingPayment({ side: "SHORT", quantity: 0.2, markPrice: 49_950, fundingRate: rate });
    assert.ok(shortPayment < 0);
  });

  it("caps extreme positive and negative funding rates", function () {
    assert.equal(calculateFundingRate({ markPrice: 60_000, indexPrice: 50_000, maxFundingRate: 0.002 }), 0.002);
    assert.equal(calculateFundingRate({ markPrice: 40_000, indexPrice: 50_000, maxFundingRate: 0.002 }), -0.002);
  });

  it("records cumulative funding without mutating the original position", function () {
    const original = Object.freeze({ side: "LONG", quantity: 0.1, cumulativeFunding: -2 });
    const result = settleDemoFunding(original, {
      markPrice: 50_500,
      indexPrice: 50_000,
      maxFundingRate: 0.003,
      timestamp: "2026-09-16T00:00:00.000Z"
    });
    assert.equal(original.cumulativeFunding, -2);
    assert.equal(result.position.cumulativeFunding, -17.15);
    assert.equal(result.position.lastFundingRate, 0.003);
    assert.equal(result.position.lastFundingAt, "2026-09-16T00:00:00.000Z");
  });

  it("rejects invalid prices, quantities, sides, and funding caps", function () {
    assert.throws(() => calculateFundingRate({ markPrice: 0, indexPrice: 50_000 }), /INVALID_MARK_PRICE/);
    assert.throws(() => calculateFundingRate({ markPrice: 50_000, indexPrice: 0 }), /INVALID_INDEX_PRICE/);
    assert.throws(() => calculateFundingRate({ markPrice: 50_000, indexPrice: 50_000, maxFundingRate: 0 }), /INVALID_FUNDING_CAP/);
    assert.throws(() => calculateFundingPayment({ side: "FLAT", quantity: 1, markPrice: 1, fundingRate: 0 }), /INVALID_SIDE/);
  });
});
