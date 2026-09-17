import assert from "node:assert/strict";
import fs from "node:fs";
import { canonicalDigest } from "../scripts/build-intent-reproducibility-seal.mjs";
import { validateLendingTestnetConfig } from "../scripts/validate-lending-testnet-config.mjs";

const read=name=>JSON.parse(fs.readFileSync(new URL(`../deployments/${name}`,import.meta.url),"utf8"));
describe("Lending Stage-0 live completion records",function(){
  const completion=read("lending-stage0-completion-bsc-testnet-97.json"),finalized=read("lending-stage0-finalized-config-bsc-testnet-97.json");
  it("preserves both canonical completion digests",function(){const{completionDigest,...completionBody}=completion,{finalizedConfigDigest,...configBody}=finalized;assert.equal(canonicalDigest(completionBody),completionDigest);assert.equal(canonicalDigest(configBody),finalizedConfigDigest)});
  it("binds four unique successful transactions to four configured feeds",function(){assert.equal(completion.feeds.length,4);assert.equal(new Set(completion.feeds.map(x=>x.address.toLowerCase())).size,4);assert.equal(new Set(completion.feeds.map(x=>x.transactionHash)).size,4);assert.deepEqual(completion.feeds.map(x=>x.address.toLowerCase()),[finalized.config.oracle.collateralPrimary,finalized.config.oracle.collateralSecondary,finalized.config.oracle.debtPrimary,finalized.config.oracle.debtSecondary].map(x=>x.toLowerCase()))});
  it("passes the fixed Lending risk and Oracle configuration validator",function(){const checked=validateLendingTestnetConfig(finalized.config);assert.equal(checked.preflightDigest,finalized.configPreflightDigest);assert.equal(finalized.status,"READY_FOR_LENDING_STAGE1_REVIEW");assert.equal(completion.status,"COMPLETE_READY_FOR_LENDING_STAGE1")});
});
