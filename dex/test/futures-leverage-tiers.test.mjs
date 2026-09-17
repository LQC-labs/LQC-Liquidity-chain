import assert from "node:assert/strict";
import { describe, it } from "mocha";
import { createLeverageTiers, resolveLeverageTier, validateTierLeverage } from "../app/futures/leverage-tiers.js";

describe("LQC Flow Futures leverage tiers", function () {
  const tiers = createLeverageTiers([
    { maxNotional: 25_000, maxLeverage: 20, maintenanceMarginRate: 0.005 },
    { maxNotional: 100_000, maxLeverage: 10, maintenanceMarginRate: 0.01 },
    { maxNotional: 250_000, maxLeverage: 5, maintenanceMarginRate: 0.02 }
  ]);

  it("assigns progressively stricter tiers as position size grows", function () {
    assert.equal(resolveLeverageTier(25_000, tiers).tier, 1);
    assert.equal(resolveLeverageTier(25_001, tiers).tier, 2);
    assert.equal(resolveLeverageTier(100_001, tiers).tier, 3);
  });

  it("allows leverage at the tier ceiling", function () {
    assert.equal(validateTierLeverage({ positionNotional: 100_000, leverage: 10, tiers }).allowed, true);
  });

  it("rejects leverage above the tier ceiling", function () {
    assert.throws(() => validateTierLeverage({ positionNotional: 100_000, leverage: 11, tiers }), /TIER_MAX_LEVERAGE_EXCEEDED/);
  });

  it("rejects positions beyond the configured tier table", function () {
    assert.throws(() => resolveLeverageTier(250_001, tiers), /POSITION_NOTIONAL_EXCEEDS_TIERS/);
  });

  it("rejects malformed tier ordering", function () {
    assert.throws(() => createLeverageTiers([
      { maxNotional: 100_000, maxLeverage: 10, maintenanceMarginRate: 0.01 },
      { maxNotional: 50_000, maxLeverage: 5, maintenanceMarginRate: 0.02 }
    ]), /TIER_NOTIONAL_NOT_ASCENDING/);
  });

  it("rejects higher leverage ceilings on larger tiers", function () {
    assert.throws(() => createLeverageTiers([
      { maxNotional: 25_000, maxLeverage: 10, maintenanceMarginRate: 0.01 },
      { maxNotional: 100_000, maxLeverage: 20, maintenanceMarginRate: 0.02 }
    ]), /TIER_LEVERAGE_NOT_DESCENDING/);
  });
});
