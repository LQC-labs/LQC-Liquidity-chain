import assert from "node:assert/strict";
import { describe, it } from "mocha";
import { planPartialLiquidation, buildLiquidationQueue } from "../app/futures/liquidation-engine.js";

describe("LQC Flow Futures partial liquidation", function () {
  it("reduces a position by the configured liquidation step", function () {
    const plan = planPartialLiquidation({ quantity: 2, markPrice: 50_000, targetReductionRatio: 0.25 });
    assert.equal(plan.reduceQuantity, 0.5);
    assert.equal(plan.remainingQuantity, 1.5);
    assert.equal(plan.fullLiquidation, false);
  });

  it("fully liquidates when the remainder would be below the minimum notional", function () {
    const plan = planPartialLiquidation({ quantity: 1, markPrice: 1_000, targetReductionRatio: 0.25, minRemainingNotional: 900 });
    assert.equal(plan.reduceQuantity, 1);
    assert.equal(plan.remainingQuantity, 0);
    assert.equal(plan.fullLiquidation, true);
  });

  it("allows an explicit full liquidation step", function () {
    const plan = planPartialLiquidation({ quantity: 1, markPrice: 50_000, targetReductionRatio: 1 });
    assert.equal(plan.fullLiquidation, true);
  });

  it("rejects liquidation ratios above 100 percent", function () {
    assert.throws(() => planPartialLiquidation({ quantity: 1, markPrice: 50_000, targetReductionRatio: 1.01 }), /LIQUIDATION_RATIO_EXCEEDS_ONE/);
  });

  it("prioritizes the lowest margin ratio deterministically", function () {
    const queue = buildLiquidationQueue([
      { id: "c", marginRatio: 0.08 },
      { id: "b", marginRatio: 0.04 },
      { id: "a", marginRatio: 0.04 }
    ]);
    assert.deepEqual(queue.map((entry) => entry.id), ["a", "b", "c"]);
  });
});
