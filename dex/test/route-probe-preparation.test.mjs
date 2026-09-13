import assert from "node:assert/strict";
import { ethers } from "ethers";
import { buildRouteProbes } from "../scripts/prepare-route-probes.mjs";

const address = n => ethers.getAddress(`0x${n.toString(16).padStart(40, "0")}`);
const deployment = { contracts: { lqc: { address: address(1) }, wbnb: { address: address(2) } }, dexes: [
  { name: "LQC Flow", id: ethers.id("LQC_FLOW"), adapter: address(3), kind: "v2" },
  { name: "PancakeSwap V2", id: ethers.id("PANCAKE_V2"), adapter: address(4), kind: "v2" },
  { name: "PancakeSwap V3", id: ethers.id("PANCAKE_V3"), adapter: address(5), kind: "v3", feeTiers: [2500] }
] };

describe("Router 2.0 quote-probe preparation", function () {
  it("prepares comparable probes for Flow, Pancake V2, and Pancake V3", function () {
    const probes = buildRouteProbes(deployment);
    assert.equal(probes.length, 3);
    assert.deepEqual(probes[2].fees, [2500]);
    assert.ok(probes.every(probe => probe.tokenIn === deployment.contracts.lqc.address));
  });
  it("rejects a V3 deployment without the reviewed 2500 tier", function () {
    const invalid = structuredClone(deployment); invalid.dexes[2].feeTiers = [500];
    assert.throws(() => buildRouteProbes(invalid), /2500/);
  });
});
