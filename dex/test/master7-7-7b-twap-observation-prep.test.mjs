import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
const root=path.resolve(import.meta.dirname,"..");
describe("Master 7/7-7B TWAP observation prep",()=>{
  const s=fs.readFileSync(path.join(root,"app","futures","v3-twap-observation-prep.js"),"utf8");
  it("pins the selected pool and approved signer",()=>{
    assert.match(s,/0xACf30D531C2DAc92a99a917d41Fa98ce7FBbED17/i);
    assert.match(s,/0xDe05e09DB1292aFf6ab62164134f1ad384Bca6FB/i);
  });
  it("only prepares observation capacity and does not implement swap or liquidity mutation",()=>{
    assert.match(s,/increaseObservationCardinalityNext/);
    assert.doesNotMatch(s,/exactInput|exactInputSingle|mint\(|burn\(|collect\(|approve\(/);
  });
  it("rechecks 1800-second observe readiness and post-transaction cardinalityNext",()=>{
    assert.match(s,/LOOKBACK=1800/);
    assert.match(s,/observe/);
    assert.match(s,/cardinalityNext<TARGET_NEXT/);
  });
});