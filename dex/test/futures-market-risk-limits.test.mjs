import assert from "node:assert/strict";
import { describe, it } from "mocha";
import {
  createMarketRiskLimits,
  calculateOpenInterest,
  validateExposureIncrease,
  validateRiskReducingOrder
} from "../app/futures/market-risk-limits.js";

describe("LQC Flow Futures market risk limits", function () {
  const limits = createMarketRiskLimits({
    maxOpenInterest: 1_000_000,
    maxPositionNotional: 100_000,
    maxOrderNotional: 25_000
  });

  it("calculates market open interest from positions", function () {
    assert.equal(calculateOpenInterest([{ quantity: 1 }, { quantity: 0.5 }], 50_000), 75_000);
  });

  it("allows exposure increases inside all configured limits", function () {
    const result = validateExposureIncrease({
      currentOpenInterest: 500_000,
      currentPositionNotional: 50_000,
      orderNotional: 20_000,
      limits
    });
    assert.equal(result.nextOpenInterest, 520_000);
    assert.equal(result.nextPositionNotional, 70_000);
  });

  it("rejects orders above the per-order notional limit", function () {
    assert.throws(() => validateExposureIncrease({ currentOpenInterest: 0, currentPositionNotional: 0, orderNotional: 25_001, limits }), /MAX_ORDER_NOTIONAL_EXCEEDED/);
  });

  it("rejects positions above the account-market position limit", function () {
    assert.throws(() => validateExposureIncrease({ currentOpenInterest: 0, currentPositionNotional: 90_000, orderNotional: 20_000, limits }), /MAX_POSITION_NOTIONAL_EXCEEDED/);
  });

  it("rejects increases above the market open-interest ceiling", function () {
    assert.throws(() => validateExposureIncrease({ currentOpenInterest: 990_000, currentPositionNotional: 0, orderNotional: 20_000, limits }), /MAX_OPEN_INTEREST_EXCEEDED/);
  });

  it("still permits risk-reducing orders while limits are saturated", function () {
    const result = validateRiskReducingOrder({ currentPositionNotional: 100_000, reduceNotional: 30_000 });
    assert.equal(result.nextPositionNotional, 70_000);
  });
});
