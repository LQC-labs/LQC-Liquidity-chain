import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
const root=path.resolve(import.meta.dirname,"..");
describe("Master 7/7-7F cardinality materialization",()=>{
 const s=fs.readFileSync(path.join(root,"app","futures","v3-cardinality-materialization.js"),"utf8");
 it("pins the selected pool, deployed TWAP adapter and approved Deployer",()=>{
   assert.match(s,/0xACf30D531C2DAc92a99a917d41Fa98ce7FBbED17/i);
   assert.match(s,/0xdE15B270d40C4CD5B8fd9C0405c9099d3441C523/i);
   assert.match(s,/0xDe05e09DB1292aFf6ab62164134f1ad384Bca6FB/i);
 });
 it("requires cardinalityNext >= 8 and uses a bounded tiny fee-100 swap",()=>{
   assert.match(s,/cardinalityNext<8/);
   assert.match(s,/const FEE=100/);
   assert.match(s,/const AMOUNT_IN=1000000000000n/);
   assert.match(s,/amountOutMinimum:liveMinimum/);
 });
 it("enforces exact approval and a 0.3 tBNB native reserve",()=>{
   assert.match(s,/approved>AMOUNT_IN/);
   assert.match(s,/approve",\[ROUTER,AMOUNT_IN\]/);
   assert.match(s,/MIN_NATIVE_RESERVE=300000000000000000n/);
 });
 it("verifies adapter latestRoundData after the state change and blocks duplicate swap",()=>{
   assert.match(s,/latestRoundData/);
   assert.match(s,/cardinality>=2&&twap\.ready/);
   assert.match(s,/localStorage\.getItem\(STORAGE_KEY\)/);
 });
});