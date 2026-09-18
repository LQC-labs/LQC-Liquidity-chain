import assert from "node:assert/strict";import fs from "node:fs";
const r=JSON.parse(fs.readFileSync(new URL("../deployments/lending-stage4-binding-review-input-bsc-testnet-97.json",import.meta.url),"utf8"));
describe("LQC 4/11 Stage 4 transaction review inputs",function(){
 it("pins chain 97 and the verified Core deployment",function(){assert.equal(r.network.chainId,97);assert.equal(r.verifiedCore.address,"0x3a3C7303829318d4cbA955c71812679DAF5699ca");assert.match(r.verifiedCore.deploymentTx,/^0x[0-9a-f]{64}$/);});
 it("keeps governance and deployer actions explicitly separated",function(){assert.deepEqual(r.orderedActions.map(x=>x.actor),["governanceSafe","governanceSafe","deployer","governanceSafe"]);});
 it("orders Index binding, market config, liquidation deployment, then Core binding",function(){assert.deepEqual(r.orderedActions.map(x=>x.action),["interest-index-set-core","configure-market","deploy-liquidation-engine","core-set-liquidation-engine"]);});
 it("pins frozen 50/70/5 market risk",function(){assert.equal(r.market.maxLtvBps,5000);assert.equal(r.market.liquidationThresholdBps,7000);assert.equal(r.market.liquidationBonusBps,500);assert.equal(r.market.enabled,true);});
 it("is preparation-only and contains no transaction data",function(){assert.equal(r.transactionOccurred,false);assert.ok(!JSON.stringify(r).includes("privateKey"));});
});
