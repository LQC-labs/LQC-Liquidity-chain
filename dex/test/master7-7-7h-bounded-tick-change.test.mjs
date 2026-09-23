import assert from "node:assert/strict";import fs from "node:fs";import path from "node:path";
const root=path.resolve(import.meta.dirname,"..");
describe("Master 7/7-7H bounded tick change",()=>{
 const s=fs.readFileSync(path.join(root,"app","futures","v3-bounded-tick-change.js"),"utf8");
 it("pins diagnostic amount 0.00005 WBNB and exact signer/pool/adapter",()=>{
  assert.match(s,/AMOUNT_IN=50000000000000n/);
  assert.match(s,/0xDe05e09DB1292aFf6ab62164134f1ad384Bca6FB/i);
  assert.match(s,/0xACf30D531C2DAc92a99a917d41Fa98ce7FBbED17/i);
  assert.match(s,/0xdE15B270d40C4CD5B8fd9C0405c9099d3441C523/i);
 });
 it("requires live quote to change current tick before enabling swap",()=>{
  assert.match(s,/predictedTick===currentTick/);
  assert.match(s,/tickFromSqrt/);
 });
 it("uses exact approval, 1% minimum output, reserve and duplicate protection",()=>{
  assert.match(s,/approved>AMOUNT_IN/);
  assert.match(s,/liveQuote\*99n\/100n/);
  assert.match(s,/MIN_NATIVE_RESERVE=300000000000000000n/);
  assert.match(s,/localStorage\.getItem\(STORAGE_KEY\)/);
 });
});