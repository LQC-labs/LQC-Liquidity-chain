import assert from "node:assert/strict";
import { describe, it } from "mocha";
import { createTradingFeeSchedule, calculateTradingFee, splitTradingFee } from "../app/futures/fee-engine.js";

describe("LQC Flow Futures trading fees", function () {
  const schedule = createTradingFeeSchedule({ makerRate: 0.0002, takerRate: 0.0005 });

  it("calculates maker fees from executed notional", function () {
    const result = calculateTradingFee({ quantity: 2, price: 50_000, liquidityRole: "maker", schedule });
    assert.equal(result.notional, 100_000);
    assert.equal(result.fee, 20);
  });

  it("calculates taker fees independently", function () {
    const result = calculateTradingFee({ quantity: 2, price: 50_000, liquidityRole: "TAKER", schedule });
    assert.equal(result.fee, 50);
  });

  it("splits collected fees between insurance and treasury", function () {
    const split = splitTradingFee(100, { insuranceShare: 0.25, treasuryShare: 0.75 });
    assert.equal(split.insuranceAmount, 25);
    assert.equal(split.treasuryAmount, 75);
  });

  it("requires fee allocation shares to sum to one", function () {
    assert.throws(() => splitTradingFee(100, { insuranceShare: 0.2, treasuryShare: 0.7 }), /FEE_SHARES_MUST_SUM_TO_ONE/);
  });

  it("rejects unsupported liquidity roles", function () {
    assert.throws(() => calculateTradingFee({ quantity: 1, price: 50_000, liquidityRole: "UNKNOWN", schedule }), /INVALID_LIQUIDITY_ROLE/);
  });
});
