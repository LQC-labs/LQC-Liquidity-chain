import assert from "node:assert/strict";
import { describe, it } from "mocha";
import { calculateLiquidationFee, routeLiquidationFeeToInsurance } from "../app/futures/liquidation-fee-engine.js";

describe("LQC Flow Futures liquidation fee routing", function () {
  it("charges the configured fee from available collateral", function () {
    const result = calculateLiquidationFee({ liquidatedNotional: 100_000, feeRate: 0.005, availableCollateral: 5_000 });
    assert.equal(result.requestedFee, 500);
    assert.equal(result.chargedFee, 500);
    assert.equal(result.remainingCollateral, 4_500);
    assert.equal(result.shortfall, 0);
  });

  it("never charges more than remaining collateral", function () {
    const result = calculateLiquidationFee({ liquidatedNotional: 100_000, feeRate: 0.01, availableCollateral: 250 });
    assert.equal(result.requestedFee, 1_000);
    assert.equal(result.chargedFee, 250);
    assert.equal(result.remainingCollateral, 0);
    assert.equal(result.shortfall, 750);
  });

  it("credits collected liquidation fees to the insurance reserve immutably", function () {
    const fund = Object.freeze({ balance: 10_000, totalCovered: 0, totalBadDebt: 0 });
    const settlement = calculateLiquidationFee({ liquidatedNotional: 50_000, feeRate: 0.005, availableCollateral: 1_000 });
    const next = routeLiquidationFeeToInsurance(fund, settlement);
    assert.equal(next.balance, 10_250);
    assert.equal(fund.balance, 10_000);
  });

  it("rejects fee rates above 100 percent", function () {
    assert.throws(() => calculateLiquidationFee({ liquidatedNotional: 1_000, feeRate: 1.01, availableCollateral: 1_000 }), /LIQUIDATION_FEE_RATE_EXCEEDS_ONE/);
  });
});
