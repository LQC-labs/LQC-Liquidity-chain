import assert from "node:assert/strict";
import { describe, it } from "mocha";
import {
  createInsuranceFund,
  depositInsurance,
  coverLiquidationLoss
} from "../app/futures/insurance-engine.js";

describe("LQC Flow Futures insurance engine", function () {
  it("fully covers liquidation loss when reserves are sufficient", function () {
    const fund = createInsuranceFund({ balance: 10_000 });
    const result = coverLiquidationLoss(fund, 2_500);
    assert.equal(result.covered, 2_500);
    assert.equal(result.badDebt, 0);
    assert.equal(result.fullyCovered, true);
    assert.equal(result.fund.balance, 7_500);
  });

  it("records bad debt when reserves are insufficient", function () {
    const fund = createInsuranceFund({ balance: 1_000 });
    const result = coverLiquidationLoss(fund, 2_500);
    assert.equal(result.covered, 1_000);
    assert.equal(result.badDebt, 1_500);
    assert.equal(result.fullyCovered, false);
    assert.equal(result.fund.totalBadDebt, 1_500);
  });

  it("enforces a per-event insurance coverage cap", function () {
    const fund = createInsuranceFund({ balance: 10_000, maxCoveragePerEvent: 750 });
    const result = coverLiquidationLoss(fund, 2_000);
    assert.equal(result.covered, 750);
    assert.equal(result.badDebt, 1_250);
    assert.equal(result.fund.balance, 9_250);
  });

  it("supports reserve deposits without mutating the original fund", function () {
    const original = createInsuranceFund({ balance: 1_000 });
    const funded = depositInsurance(original, 500);
    assert.equal(original.balance, 1_000);
    assert.equal(funded.balance, 1_500);
  });

  it("rejects invalid insurance accounting inputs", function () {
    assert.throws(() => createInsuranceFund({ balance: -1 }), /INVALID_INSURANCE_BALANCE/);
    assert.throws(() => depositInsurance(createInsuranceFund(), 0), /INVALID_INSURANCE_DEPOSIT/);
    assert.throws(() => coverLiquidationLoss(createInsuranceFund(), -1), /INVALID_LIQUIDATION_LOSS/);
  });
});
