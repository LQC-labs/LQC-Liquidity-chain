import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
const root=path.resolve(import.meta.dirname,"..");
describe("Master 7/7-7O final Governance verifier",()=>{
 const s=fs.readFileSync(path.join(root,"scripts","verify-master7-7-7o-final-governance.mjs"),"utf8");
 it("pins final owner, primary, feed and TWAP",()=>{
   for(const x of[
    "0x89d992f696B40ABbDB6610144faeF336911D8175",
    "0x2582c3156e42df6115c020fb8006b3949c93c1a9",
    "0x2514895c72f50D8bd4B4F9b1110F0D6bD2c97526",
    "0x5AE96E36356AC18728804577E926B4b362017c0d"
   ]) assert.match(s,new RegExp(x,"i"));
 });
 it("requires heartbeat 3600 and deviation 500",()=>{assert.match(s,/HEARTBEAT=3600/);assert.match(s,/DEVIATION=500/);});
 it("verifies feedConfigs and getPrice read-only",()=>{assert.match(s,/feedConfigs/);assert.match(s,/getPrice/);assert.doesNotMatch(s,/setFeed|setCircuitBreaker|sendTransaction/);});
});