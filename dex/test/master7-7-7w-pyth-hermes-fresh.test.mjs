import assert from "node:assert/strict";import fs from "node:fs";import path from "node:path";
const root=path.resolve(import.meta.dirname,"..");
describe("7/7-7W Pyth Hermes fresh validation",()=>{
 const s=fs.readFileSync(path.join(root,"scripts","validate-master7-7-7w-pyth-hermes-fresh.mjs"),"utf8");
 it("pins BNB/USD feed and Hermes latest endpoint",()=>{assert.match(s,/2f95862b045670cd22bee3114c39763a4a08beeb663b145d283c31d7d1101c4f/);assert.match(s,/pyth\\.dourolabs\\.app\\/hermes/);assert.match(s,/PYTH_API_KEY/);assert.match(s,/authorization/);});
 it("requires fresh signed data and 500bps agreement",()=>{assert.match(s,/binaryUpdateCount/);assert.match(s,/age<=120n/);assert.match(s,/dev<=500n/);assert.match(s,/pullOracleArchitectureReady/);});
 it("is read-only",()=>{assert.doesNotMatch(s,/sendTransaction|updatePriceFeeds|setFeed|setCircuitBreaker/);});
});