import assert from "node:assert/strict";import fs from "node:fs";import path from "node:path";
const root=path.resolve(import.meta.dirname,"..");
describe("7/7-7P reference pool health discovery",()=>{
 const s=fs.readFileSync(path.join(root,"scripts","discover-master7-7-7p-reference-pool-health.mjs"),"utf8");
 it("checks all supported Pancake V3 fee tiers",()=>{for(const f of["100","500","2500","10000"])assert.match(s,new RegExp(f));});
 it("uses uint32 feeProtocol ABI and compares Chainlink deviation",()=>{assert.match(s,/uint16,uint16,uint16,uint32,bool/);assert.match(s,/spotDeviationBps/);assert.match(s,/twapDeviationBps/);});
 it("is read-only",()=>{assert.doesNotMatch(s,/sendTransaction|approve|swap|increaseObservationCardinalityNext/);});
});