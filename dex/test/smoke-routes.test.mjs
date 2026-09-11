import assert from "node:assert/strict";
import { ethers } from "ethers";
import {
  assertProbeMatchesDeployment,
  assertProbePairApproved,
  parseRouteProbes,
  resolveCanonicalQuoteBlock,
  resolveRouteData
} from "../scripts/smoke-test-bsc-routes.mjs";

describe("BSC testnet route smoke configuration", function () {
  const dexId = ethers.id("LQC_FLOW");
  const tokenIn = "0x0000000000000000000000000000000000000001";
  const tokenOut = "0x0000000000000000000000000000000000000002";
  const middle = "0x0000000000000000000000000000000000000003";
  const valid = { dexId, tokenIn, tokenOut, amountInRaw: "1", routeData: "0x1234" };

  it("accepts a bounded, uniquely identified route probe", function () {
    const probes = parseRouteProbes(JSON.stringify([valid]));
    assert.equal(probes.length, 1);
    assert.equal(probes[0].amountInRaw, "1");
  });

  it("rejects malformed, zero-value, and duplicate probes", function () {
    assert.throws(() => parseRouteProbes("[]"), /non-empty array/);
    assert.throws(() => parseRouteProbes(JSON.stringify([{ ...valid, amountInRaw: "0" }])), /positive/);
    assert.throws(() => parseRouteProbes(JSON.stringify([{ ...valid, routeData: "0x" }])), /routeData/);
    assert.throws(() => parseRouteProbes(JSON.stringify([{ ...valid, routeData: undefined, path: [tokenIn] }])), /path/);
    assert.throws(() => parseRouteProbes(JSON.stringify([valid, valid])), /duplicates/);
  });

  it("requires every probe to match a recorded DEX adapter", function () {
    const deployment = { contracts: { lqc: { address: tokenIn }, mockUsdt: { address: tokenOut } }, dexes: [{ id: dexId, name: "LQC Flow", adapter: tokenOut }] };
    assert.equal(assertProbeMatchesDeployment(valid, deployment), deployment.dexes[0]);
    assert.throws(() => assertProbeMatchesDeployment({ ...valid, dexId: ethers.id("UNKNOWN") }, deployment), /not in/);
  });

  it("allows only built-in or explicitly reviewed token pairs", function () {
    const dex = { id: dexId, name: "LQC Flow" };
    const builtIn = { contracts: { lqc: { address: tokenIn }, wbnb: { address: tokenOut } } };
    assert.doesNotThrow(() => assertProbePairApproved(valid, builtIn, dex));
    const reviewed = { reviewedPairs: [{ tokenA: tokenIn, tokenB: tokenOut, dexIds: [dexId] }] };
    assert.doesNotThrow(() => assertProbePairApproved(valid, reviewed, dex));
    assert.throws(() => assertProbePairApproved(valid, { reviewedPairs: [{ tokenA: tokenIn, tokenB: tokenOut, dexIds: [ethers.id("OTHER")] }] }, dex), /approval registry/);
    assert.throws(() => assertProbePairApproved({ ...valid, tokenOut: middle }, reviewed, dex), /approval registry/);
  });

  it("pins read-only quotes to a bounded finalized block", async function () {
    assert.equal(await resolveCanonicalQuoteBlock({ getBlockNumber: async () => 1_000 }, 12), 988);
    await assert.rejects(() => resolveCanonicalQuoteBlock({ getBlockNumber: async () => 1 }, 12), /invalid quote head/);
    await assert.rejects(() => resolveCanonicalQuoteBlock({ getBlockNumber: async () => 1_000 }, 1), /between 2 and 200/);
  });

  it("automatically ABI-encodes V2 and LQC Flow paths", function () {
    const probe = { ...valid, routeData: undefined, path: [tokenIn, middle, tokenOut] };
    assert.equal(
      resolveRouteData(probe, { name: "LQC Flow", kind: "v2" }),
      ethers.AbiCoder.defaultAbiCoder().encode(["address[]"], [probe.path])
    );
  });

  it("encodes only deployment-approved V3 paths", function () {
    const probe = { ...valid, routeData: undefined, path: [tokenIn, middle, tokenOut], fees: [500, 2500] };
    const dex = {
      name: "PancakeSwap V3", kind: "v3", maxHops: 2, feeTiers: [500, 2500],
      pools: [
        { tokenA: tokenIn, tokenB: middle, fee: 500 },
        { tokenA: tokenOut, tokenB: middle, fee: 2500 }
      ]
    };
    assert.equal(
      resolveRouteData(probe, dex),
      ethers.solidityPacked(["address", "uint24", "address", "uint24", "address"], [tokenIn, 500, middle, 2500, tokenOut])
    );
    assert.throws(() => resolveRouteData({ ...probe, fees: [500] }, dex), /hop count/);
    assert.throws(() => resolveRouteData({ ...probe, fees: [100, 2500] }, dex), /unapproved V3 fee/);
    assert.throws(() => resolveRouteData({ ...probe, fees: [2500, 2500] }, dex), /outside the deployment allowlist/);
    assert.throws(() => resolveRouteData(probe, { ...dex, maxHops: 1 }), /maximum hop/);
    assert.throws(() => resolveRouteData(valid, dex), /structured path and fees/);
  });

  it("rejects structured paths whose endpoints differ from the probe", function () {
    assert.throws(
      () => resolveRouteData({ ...valid, routeData: undefined, path: [middle, tokenOut] }, { name: "LQC Flow", kind: "v2" }),
      /endpoints/
    );
  });
});
