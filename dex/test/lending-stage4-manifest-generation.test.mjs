import assert from "node:assert/strict";import fs from "node:fs";import { ethers } from "ethers";import { buildLendingStage4Manifest } from "../scripts/prepare-lending-stage4-manifest.mjs";
const input=JSON.parse(fs.readFileSync(new URL("../deployments/lending-stage4-binding-review-input-bsc-testnet-97.json",import.meta.url),"utf8"));
describe("LQC 4/11 Stage4 manifest generation",function(){
 it("compiles artifacts then deterministically creates four reviewed actions",async function(){const m=await buildLendingStage4Manifest({reviewInput:input});assert.equal(m.orderedActions.length,4);assert.equal(m.orderedActions[0].data.slice(0,10),ethers.id("setCore(address)").slice(0,10));assert.equal(m.orderedActions[1].data.slice(0,10),ethers.id("configureMarket((address,address,uint8,uint8,uint16,uint16,uint16,uint128,uint128,uint128,bool))").slice(0,10));assert.equal(m.orderedActions[2].to,null);assert.equal(m.orderedActions[3].data,null);assert.match(m.manifestDigest,/^sha256:/);});
});
