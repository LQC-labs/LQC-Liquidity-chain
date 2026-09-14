import assert from "node:assert/strict";
import { ethers } from "ethers";
import { assessRiskFinalization } from "../scripts/verify-router2-risk-finalization.mjs";

const address = digit => `0x${digit.repeat(40)}`;
const expected = { governance: address("1"), executionRouter: address("2"), tlqc: { maxPerTransaction: "1000", maxPerDay: "10000" }, wbnb: { maxPerTransaction: "10", maxPerDay: "100" } };
const configured = { owner: address("3"), pendingOwner: address("1"), executor: address("2"), tlqc: { allowed: true, maxPerTransaction: "1000", maxPerDay: "10000", dexCap: "1000" }, wbnb: { allowed: true, maxPerTransaction: "10", maxPerDay: "100", dexCap: "10" } };

describe("Router 2.0 Risk Registry finalization verifier", function () {
  it("reports the exact Safe acceptance gate without allowing repeated configuration", function () { const result = assessRiskFinalization(configured, expected); assert.equal(result.status, "AWAITING_SAFE_ACCEPTANCE"); assert.equal(result.safeToRepeatRiskConfiguration, false); });
  it("reports finalized only when the Safe owns the registry and pending owner is cleared", function () { const result = assessRiskFinalization({ ...configured, owner: expected.governance, pendingOwner: ethers.ZeroAddress }, expected); assert.equal(result.status, "FINALIZED"); assert(Object.values(result.checks).every(Boolean)); });
  it("blocks advancement when any recorded cap differs", function () { const result = assessRiskFinalization({ ...configured, tlqc: { ...configured.tlqc, dexCap: "999" } }, expected); assert.equal(result.status, "BLOCKED"); assert.equal(result.checks.tlqcDexCap, false); });
});
