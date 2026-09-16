import assert from "node:assert/strict";
import { describe, it } from "mocha";
import { adlScore, rankAdlCandidates, buildAdlPlan } from "../app/futures/adl-engine.js";

describe("LQC Flow Futures ADL engine", function () {
  const candidates = [
    { id: "short-low", side: "SHORT", quantity: 0.1, entryPrice: 55_000, markPrice: 50_000, collateral: 2_000 },
    { id: "short-high", side: "SHORT", quantity: 0.2, entryPrice: 60_000, markPrice: 50_000, collateral: 1_000 },
    { id: "long-profit", side: "LONG", quantity: 0.2, entryPrice: 40_000, markPrice: 50_000, collateral: 1_000 }
  ];

  it("scores profitable positions by profit ratio and effective leverage", function () {
    assert.ok(adlScore(candidates[1]) > adlScore(candidates[0]));
  });

  it("ranks only profitable positions opposite the bankrupt side", function () {
    const ranked = rankAdlCandidates(candidates, "LONG");
    assert.deepEqual(ranked.map((p) => p.id), ["short-high", "short-low"]);
  });

  it("builds a deterministic ADL plan until bad debt is absorbed", function () {
    const plan = buildAdlPlan({ positions: candidates, bankruptSide: "LONG", badDebt: 12_000 });
    assert.deepEqual(plan.selected.map((p) => p.id), ["short-high", "short-low"]);
    assert.equal(plan.selected[0].absorbAmount, 10_000);
    assert.equal(plan.selected[1].absorbAmount, 2_000);
    assert.equal(plan.residualBadDebt, 0);
  });

  it("keeps residual bad debt explicit when opposing notional is insufficient", function () {
    const plan = buildAdlPlan({ positions: candidates, bankruptSide: "LONG", badDebt: 20_000 });
    assert.equal(plan.residualBadDebt, 5_000);
  });

  it("returns an empty plan for zero bad debt", function () {
    const plan = buildAdlPlan({ positions: candidates, bankruptSide: "LONG", badDebt: 0 });
    assert.equal(plan.selected.length, 0);
    assert.equal(plan.residualBadDebt, 0);
  });
});
