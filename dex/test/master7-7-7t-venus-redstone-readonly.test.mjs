import assert from "node:assert/strict";import fs from "node:fs";import path from "node:path";
const root=path.resolve(import.meta.dirname,"..");
describe("7/7-7T Venus RedStone read-only validation",()=>{
 const s=fs.readFileSync(path.join(root,"scripts","validate-master7-7-7t-venus-redstone-readonly.mjs"),"utf8");
 it("pins Venus BSC testnet RedStone and Resilient oracles",()=>{assert.match(s,/0x0Af51d1504ac5B711A9EAFe2fAC11A51d32029Ad/i);assert.match(s,/0x3cD69251D04A28d887Ac14cbe2E14c52F3D57823/i);});
 it("queries WBNB and compares to Chainlink",()=>{assert.match(s,/getPrice\(WBNB\)/);assert.match(s,/deviationBps/);assert.match(s,/within500Bps/);});
 it("is read-only",()=>{assert.doesNotMatch(s,/sendTransaction|setFeed|setCircuitBreaker|updatePrice/);});
});