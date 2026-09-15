import assert from "node:assert/strict";
import { ethers } from "ethers";
import { buildLqcFlowRouteBundle, LQC_FLOW_ADAPTER, LQC_FLOW_DEX_ID, LQC_FLOW_ROUTER, recordLqcFlowQuoteComparison } from "../scripts/prepare-router2-lqc-flow-route.mjs";

describe("Router 2.0 LQC Flow second-route preparation", function () {
  it("prepares an isolated chain-97 adapter deployment without a transaction", async function () {
    const bundle = await buildLqcFlowRouteBundle();
    assert.equal(bundle.network.chainId, 97);
    assert.equal(bundle.contracts.lqcFlowRouter, LQC_FLOW_ROUTER);
    assert.equal(bundle.dex.id, LQC_FLOW_DEX_ID);
    assert.equal(bundle.dex.adapter, null);
    assert.equal(bundle.orderedActions.length, 1);
    assert.equal(bundle.orderedActions[0].to, null);
    assert.equal(bundle.orderedActions[0].value, "0");
    assert.match(bundle.status, /deployment-prepared/);
    assert.match(bundle.safety, /Does not replace Pancake V3/);
  });

  it("encodes registration and existing pilot caps only after an adapter address is supplied", async function () {
    const adapter = "0x1111111111111111111111111111111111111111";
    const bundle = await buildLqcFlowRouteBundle(adapter);
    assert.equal(bundle.dex.adapter, adapter);
    assert.deepEqual(bundle.orderedActions.map(action => action.action), [
      "deploy-lqc-flow-adapter", "register-lqc-flow", "cap-lqc-flow-tlqc", "cap-lqc-flow-wbnb",
    ]);
    assert.ok(bundle.orderedActions.slice(1).every(action => ethers.isAddress(action.to) && action.value === "0"));
    const path = ethers.AbiCoder.defaultAbiCoder().decode(["address[]"], bundle.routeProbe.routeData)[0];
    assert.equal(path.length, 2);
    assert.equal(path[0].toLowerCase(), bundle.tokens.tokenIn.toLowerCase());
    assert.equal(path[1].toLowerCase(), bundle.tokens.tokenOut.toLowerCase());
  });

  it("rejects a malformed adapter address", async function () {
    await assert.rejects(buildLqcFlowRouteBundle("0x1234"), /adapterAddress must be valid/);
  });

  it("records the user-observed read-only comparison without claiming a transaction", async function () {
    const recorded = recordLqcFlowQuoteComparison(await buildLqcFlowRouteBundle());
    assert.equal(recorded.comparisonEvidence.adapter, LQC_FLOW_ADAPTER);
    assert.equal(recorded.comparisonEvidence.status, "success");
    assert.equal(recorded.comparisonEvidence.preferredQuote, "LQC_FLOW");
    assert.equal(recorded.comparisonEvidence.transactionOccurred, false);
    assert.ok(BigInt(recorded.comparisonEvidence.quotes.lqcFlow) > BigInt(recorded.comparisonEvidence.quotes.pancakeV3));
  });
});
