import assert from "node:assert/strict";import fs from "node:fs";import path from "node:path";
const root=path.resolve(import.meta.dirname,"..");
describe("7/7-7Q stable quote candidate discovery",()=>{
 const s=fs.readFileSync(path.join(root,"scripts","discover-master7-7-7q-stable-quote-candidates.mjs"),"utf8");
 it("checks multiple USDC/USDT candidates and all V3 fee tiers",()=>{assert.match(s,/USDC_A/);assert.match(s,/USDT_A/);for(const f of["100","500","2500","10000"])assert.match(s,new RegExp(f));});
 it("reads decimals and compares spot/TWAP deviation to Chainlink",()=>{assert.match(s,/decimals/);assert.match(s,/spotDeviationBps/);assert.match(s,/twapDeviationBps/);});
 it("is read-only",()=>{assert.doesNotMatch(s,/sendTransaction|approve|swap|setFeed|setCircuitBreaker/);});
});