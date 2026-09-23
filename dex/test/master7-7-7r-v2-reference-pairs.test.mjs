import assert from "node:assert/strict";import fs from "node:fs";import path from "node:path";
const root=path.resolve(import.meta.dirname,"..");
describe("7/7-7R V2 reference pair discovery",()=>{
 const s=fs.readFileSync(path.join(root,"scripts","discover-master7-7-7r-v2-reference-pairs.mjs"),"utf8");
 it("checks two historical BSC testnet V2 factories",()=>{assert.match(s,/0x6725F303/i);assert.match(s,/0xb7926C0430/i);});
 it("reads reserves and cumulative prices",()=>{assert.match(s,/getReserves/);assert.match(s,/price0CumulativeLast/);assert.match(s,/price1CumulativeLast/);});
 it("compares spot price to Chainlink read-only",()=>{assert.match(s,/spotDeviationBps/);assert.doesNotMatch(s,/sendTransaction|swap|approve/);});
});