import assert from "node:assert/strict";
import { buildReleaseReadiness } from "../scripts/report-router2-release-readiness.mjs";

describe("Router 2.0 unified release readiness",function(){
  it("reports deployment drift without rewriting historical evidence",function(){
    const report=buildReleaseReadiness(new URL("..",import.meta.url).pathname);
    assert.equal(report.scope,"offline-only");
    assert.equal(report.network,"BSC Testnet");
    assert.equal(report.chainId,97);
    assert.equal(report.deploymentOccurred,false);
    assert.equal(report.transactionOccurred,false);
    assert.equal(report.releaseReady,report.blockers.length===0);
    assert.equal(report.status,report.releaseReady?"ready":"blocked_redeployment_required");
    assert.ok(["match","redeploy_required"].includes(report.components.v3Adapter.status));
    if(report.components.proofGateway.redeployRequired)assert(report.blockers.some(x=>x.component==="proof_gateway"));
    if(report.components.v3Adapter.status==="redeploy_required")assert(report.blockers.some(x=>x.component==="pancake_v3_adapter"));
  });
});
