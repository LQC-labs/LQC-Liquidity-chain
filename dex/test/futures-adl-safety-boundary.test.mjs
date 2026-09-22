import assert from "node:assert/strict";
import fs from "node:fs";

const engine = fs.readFileSync(new URL("../contracts/futures/LQCPerpEngine.sol", import.meta.url), "utf8");

describe("Master 7/5-6 bounded ADL safety boundary", function () {
  it("keeps ADL disabled by default and Governance-gated", function () {
    assert.match(engine, /mapping\(uint256 => bool\) public adlEnabled/);
    assert.match(engine, /function configureAdlSafety[\s\S]*external onlyRegistryOwner/);
  });

  it("requires a bounded nonzero reduction cap when enabled", function () {
    assert.match(engine, /enabled && \(maxReductionBps == 0 \|\| maxReductionBps > BPS\)/);
    assert.match(engine, /!enabled && maxReductionBps != 0/);
  });

  it("requires unresolved Futures residual bad debt for emergency activation", function () {
    assert.match(engine, /function isAdlEmergencyActive/);
    assert.match(engine, /vault\.residualBadDebt\(collateralToken\) != 0/);
  });

  it("preserves the safety boundary after bounded ADL execution is added", function () {
    assert.match(engine, /function executeAdl/);
    assert.match(engine, /function executeAdl[\s\S]*external onlyRegistryOwner/);
    assert.match(engine, /AdlBadDebtRequired/);
    assert.match(engine, /AdlReductionTooLarge/);
    assert.doesNotMatch(engine, /function autoDeleverage/);
  });
});
