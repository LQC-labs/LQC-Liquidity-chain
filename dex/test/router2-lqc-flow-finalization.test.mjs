import assert from "node:assert/strict";
import { assessLqcFlowFinalization } from "../scripts/verify-router2-lqc-flow-finalization.mjs";

const expected = {
  safe: "0x5235e26EE4D511aE8ba1FB1cff2619Fc1D90C02A",
  adapter: "0x14db750acf95b469aba3e74032e6db61087ef4cd",
  tlqcCap: "1000000000000000000000",
  wbnbCap: "10000000000000000",
};
const complete = {
  owner: expected.safe,
  dex: { adapter: expected.adapter, enabled: true },
  tlqc: { allowed: true, cap: expected.tlqcCap },
  wbnb: { allowed: true, cap: expected.wbnbCap },
};

describe("Router 2.0 LQC Flow finalization verifier", function () {
  it("requires governance ownership, the registered live adapter, and both exact caps", function () {
    const result = assessLqcFlowFinalization(complete, expected);
    assert.equal(result.status, "FINALIZED");
    assert.equal(result.safeToRepeatCapTransactions, false);
    assert.ok(Object.values(result.checks).every(Boolean));
  });

  for (const mutation of [
    { name: "wrong owner", value: { owner: "0x0000000000000000000000000000000000000001" } },
    { name: "disabled route", value: { dex: { ...complete.dex, enabled: false } } },
    { name: "wrong adapter", value: { dex: { ...complete.dex, adapter: "0x0000000000000000000000000000000000000001" } } },
    { name: "missing tLQC cap", value: { tlqc: { ...complete.tlqc, cap: "0" } } },
    { name: "expanded WBNB cap", value: { wbnb: { ...complete.wbnb, cap: "10000000000000001" } } },
  ]) {
    it(`fails closed for ${mutation.name}`, function () {
      const result = assessLqcFlowFinalization({ ...complete, ...mutation.value }, expected);
      assert.equal(result.status, "BLOCKED");
      assert.equal(result.safeToRepeatCapTransactions, false);
    });
  }
});
