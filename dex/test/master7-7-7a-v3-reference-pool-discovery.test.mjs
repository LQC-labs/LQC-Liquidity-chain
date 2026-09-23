import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
const root=path.resolve(import.meta.dirname,"..");
describe("Master 7/7-7A V3 reference pool discovery",()=>{
 it("is explicitly read-only",()=>{
   const s=fs.readFileSync(path.join(root,"app","futures","v3-reference-pool-discovery.js"),"utf8");
   assert.match(s,/eth_call/);
   assert.doesNotMatch(s,/eth_sendTransaction/);
   assert.match(s,/observe/);
   assert.match(s,/liquidity/);
   assert.match(s,/observationCardinality/);
 });
 it("checks all canonical Pancake V3 fee tiers used by the explorer",()=>{
   const s=fs.readFileSync(path.join(root,"app","futures","v3-reference-pool-discovery.js"),"utf8");
   for(const fee of [100,500,2500,10000]) assert.match(s,new RegExp(String(fee)));
 });
});