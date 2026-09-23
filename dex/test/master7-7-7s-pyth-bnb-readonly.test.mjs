import assert from "node:assert/strict";import fs from "node:fs";import path from "node:path";
const root=path.resolve(import.meta.dirname,"..");
describe("7/7-7S Pyth BNB read-only validation",()=>{
 const s=fs.readFileSync(path.join(root,"scripts","validate-master7-7-7s-pyth-bnb-readonly.mjs"),"utf8");
 it("pins BSC Testnet Pyth and BNB/USD feed id",()=>{assert.match(s,/0x5744Cbf430D99456a0A8771208b674F27f8EF0Fb/i);assert.match(s,/0x2f95862b045670cd22bee3114c39763a4a08beeb663b145d283c31d7d1101c4f/i);});
 it("checks unsafe and freshness-bounded reads",()=>{assert.match(s,/getPriceUnsafe/);assert.match(s,/getPriceNoOlderThan/);assert.match(s,/MAX_AGE=3600/);});
 it("compares normalized Pyth to Chainlink at 500 bps",()=>{assert.match(s,/deviationBps/);assert.match(s,/within500Bps/);assert.match(s,/adapterImplementationReady/);});
 it("is read-only",()=>{assert.doesNotMatch(s,/updatePriceFeeds|sendTransaction|setFeed|setCircuitBreaker/);});
});