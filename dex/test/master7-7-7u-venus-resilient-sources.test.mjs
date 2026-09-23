import assert from "node:assert/strict";import fs from "node:fs";import path from "node:path";
const root=path.resolve(import.meta.dirname,"..");
describe("7/7-7U Venus Resilient source independence",()=>{
 const s=fs.readFileSync(path.join(root,"scripts","validate-master7-7-7u-venus-resilient-sources.mjs"),"utf8");
 it("reads MAIN PIVOT FALLBACK roles",()=>{assert.match(s,/MAIN:0/);assert.match(s,/PIVOT:1/);assert.match(s,/FALLBACK:2/);assert.match(s,/getOracle/);});
 it("checks RedStone participation and source diversity",()=>{assert.match(s,/redstoneUsed/);assert.match(s,/distinctEnabledSources/);assert.match(s,/independentEnoughForLQCReference/);});
 it("is read-only",()=>{assert.doesNotMatch(s,/sendTransaction|setTokenConfig|setFeed|setCircuitBreaker/);});
});