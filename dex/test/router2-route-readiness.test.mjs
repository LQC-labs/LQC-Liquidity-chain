import assert from "node:assert/strict";
import fs from "node:fs";
import { ethers } from "ethers";
import { buildRouter2RouteReadiness } from "../scripts/build-router2-route-readiness.mjs";

const pool = JSON.parse(fs.readFileSync(new URL("../deployments/pancake-v3-pool-bsc-testnet-97.json", import.meta.url)));

describe("Router 2.0 live-route readiness", function () {
  it("marks the completed PancakeSwap V3 pilot ready without overstating Router deployment", function () {
    const report = buildRouter2RouteReadiness(pool);
    assert.equal(report.pancakeV3Pilot.status, "ready");
    assert.equal(report.pancakeV3Pilot.forwardSwap, "success");
    assert.equal(report.pancakeV3Pilot.reverseSwap, "success");
    assert.deepEqual(report.pancakeV3Pilot.residualAllowances, { tLQC: "0", WBNB: "0" });
    assert.equal(report.router2.status, "deployment-required");
    assert.equal(report.router2.comparableRoutes, 0);
    assert.ok(report.router2.missingContracts.includes("pancakeV3Adapter"));
  });

  it("requires two deployed routes and exact registration of the verified V3 pool", function () {
    const address = n => ethers.getAddress(`0x${n.toString(16).padStart(40, "0")}`);
    const deployment = { contracts: {
      dexRegistry: { address: address(1) }, quoteRouter: { address: address(2) },
      executionRouter: { address: address(3) }, pancakeV3Adapter: { address: address(4) },
    }, dexes: [
      { kind: "v2", enabled: true },
      { kind: "v3", enabled: true, pools: [{ address: pool.contracts.pancakeV3Pool, fee: 2500 }] },
    ] };
    const report = buildRouter2RouteReadiness(pool, deployment);
    assert.equal(report.router2.status, "ready-for-live-route-probes");
    assert.equal(report.router2.comparableRoutes, 2);
    assert.equal(report.router2.v3Registered, true);
    assert.deepEqual(report.router2.blockers, []);
  });

  it("rejects a wrong-network or malformed pool record", function () {
    assert.throws(() => buildRouter2RouteReadiness({ network: { chainId: 56 }, contracts: {} }), /chain-97/);
  });
});
