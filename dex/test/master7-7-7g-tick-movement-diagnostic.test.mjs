import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
const root=path.resolve(import.meta.dirname,"..");
describe("Master 7/7-7G tick movement diagnostic",()=>{
 const s=fs.readFileSync(path.join(root,"app","futures","v3-tick-movement-diagnostic.js"),"utf8");
 it("is strictly read-only",()=>{
   assert.match(s,/eth_call/);
   assert.doesNotMatch(s,/eth_sendTransaction|approve\(|deposit\(|exactInputSingle.*send/);
 });
 it("pins the selected pool, official quoter, fee 100 and bounded quote ladder",()=>{
   assert.match(s,/0xACf30D531C2DAc92a99a917d41Fa98ce7FBbED17/i);
   assert.match(s,/0xbC203d7f83677c7ed3F7acEc959963E7F4ECC5C2/i);
   assert.match(s,/const FEE=100/);
   assert.match(s,/1000000000000000n/);
 });
 it("compares predicted tick against the live current tick",()=>{
   assert.match(s,/tickFromSqrtPriceX96/);
   assert.match(s,/predictedTick!==currentTick/);
   assert.match(s,/firstQuotedTickChange/);
 });
});