import assert from "node:assert/strict";
import { describe, it } from "mocha";
import { unrealizedPnl, adlScore, rankAdlCandidates, buildAdlPlan } from "../app/futures/adl-engine.js";

describe("LQC Flow Futures ADL engine", function () {
  const candidates = [
    { id: "short-low", side: "SHORT", quantity: 0.1, entryPrice: 55_000, markPrice: 50_000, collateral: 2_000 },
    { id: "short-high", side: "SHORT", quantity: 0.2, entryPrice: 60_000, markPrice: 50_000, collateral: 1_000 },
    { id: "long-profit", side: "LONG", quantity: 0.2, entryPrice: 40_000, markPrice: 50_000, collateral: 1_000 }
  ];

  it("calculates realizable unrealized profit by position side", function () {
    assert.equal(unrealizedPnl(candidates[0]), 500);
    assert.equal(unrealizedPnl(candidates[1]), 2_000);
    assert.equal(unrealizedPnl(candidates[2]), 2_000);
  });

  it("scores profitable positions by profit ratio and effective leverage", function () {
    assert.ok(adlScore(candidates[1]) > adlScore(candidates[0]));
  });

  it("ranks only profitable positions opposite the bankrupt side", function () {
    const ranked = rankAdlCandidates(candidates, "LONG");
    assert.deepEqual(ranked.map((p) => p.id), ["short-high", "short-low"]);
  });

  it("caps ADL absorption by realizable profit instead of full notional", function () {
    const plan = buildAdlPlan({ positions: candidates, bankruptSide: "LONG", badDebt: 2_200 });
    assert.deepEqual(plan.selected.map((p) => p.id), ["short-high", "short-low"]);
    assert.equal(plan.selected[0].availableProfit, 2_000);
    assert.equal(plan.selected[0].absorbAmount, 2_000);
    assert.equal(plan.selected[0].reduceQuantity, 0.2);
    assert.equal(plan.selected[1].absorbAmount, 200);
    assert.equal(plan.selected[1].reduceQuantity, 0.04);
    assert.ok(Math.abs(plan.selected[1].remainingQuantity - 0.06) < 1e-12);
    assert.equal(plan.residualBadDebt, 0);
  });

  it("keeps residual bad debt explicit when opposing profit is insufficient", function () {
    const plan = buildAdlPlan({ positions: candidates, bankruptSide: "LONG", badDebt: 3_000 });
    assert.equal(plan.selected.length, 2);
    assert.equal(plan.selected[0].absorbAmount, 2_000);
    assert.equal(plan.selected[1].absorbAmount, 500);
    assert.equal(plan.residualBadDebt, 500);
  });

  it("returns an empty plan for zero bad debt", function () {
    const plan = buildAdlPlan({ positions: candidates, bankruptSide: "LONG", badDebt: 0 });
    assert.equal(plan.selected.length, 0);
    assert.equal(plan.residualBadDebt, 0);
  });
});
