import assert from "node:assert/strict";import fs from "node:fs";import path from "node:path";
const root=path.resolve(import.meta.dirname,"..");
describe("7/7-7V Venus Binance read-only validation",()=>{
 const s=fs.readFileSync(path.join(root,"scripts","validate-master7-7-7v-venus-binance-readonly.mjs"),"utf8");
 it("pins Venus BNB testnet Binance Oracle",()=>{assert.match(s,/0xB58BFDCE610042311Dc0e034a80Cc7776c1D68f5/i);});
 it("queries WBNB and compares to Chainlink",()=>{assert.match(s,/getPrice\(WBNB\)/);assert.match(s,/deviationBps/);assert.match(s,/within500Bps/);});
 it("is read-only",()=>{assert.doesNotMatch(s,/sendTransaction|setFeed|setCircuitBreaker|setMaxStalePeriod/);});
});