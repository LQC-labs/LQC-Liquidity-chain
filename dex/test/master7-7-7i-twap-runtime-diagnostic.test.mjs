import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
const root=path.resolve(import.meta.dirname,"..");
describe("Master 7/7-7I TWAP runtime diagnostic",()=>{
 const s=fs.readFileSync(path.join(root,"scripts","diagnose-master7-7-7i-twap-runtime.mjs"),"utf8");
 it("is strictly read-only and pins recovered pool/adapter",()=>{
   assert.match(s,/0xACf30D531C2DAc92a99a917d41Fa98ce7FBbED17/i);
   assert.match(s,/0xdE15B270d40C4CD5B8fd9C0405c9099d3441C523/i);
   assert.doesNotMatch(s,/sendTransaction|eth_sendTransaction/);
 });
 it("checks slot0, direct observe and adapter latestRoundData independently",()=>{
   assert.match(s,/slot0/);
   assert.match(s,/observe\(\[WINDOW,0\]\)/);
   assert.match(s,/latestRoundData/);
   assert.match(s,/meanTick/);
 });
});