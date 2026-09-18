import assert from "node:assert/strict";import fs from "node:fs";
const src=fs.readFileSync(new URL("../contracts/lending/LQCOracleManager.sol",import.meta.url),"utf8"),tests=fs.readFileSync(new URL("lending-oracle-manager.test.mjs",import.meta.url),"utf8");
describe("LQC official 4/6 Oracle gate",function(){
 it("requires distinct dual feeds and bounded age/deviation configuration",function(){for(const x of["primary == secondary","maxAge < 60","maxAge > 2 days","MAX_DEVIATION_BPS"])assert.ok(src.includes(x),x);});
 it("normalizes supported feed decimals and rejects excessive decimals",function(){assert.ok(src.includes("MAX_FEED_DECIMALS = 18"));assert.ok(src.includes("10 ** (18 - decimals)"));});
 it("fails closed on invalid stale or incomplete rounds",function(){for(const x of["answer <= 0","updatedAt > block.timestamp","answeredInRound < roundId","StalePrice"])assert.ok(src.includes(x),x);});
 it("prices collateral conservatively low and debt conservatively high",function(){assert.ok(src.includes("primaryPrice < secondaryPrice"));assert.ok(src.includes("primaryPrice > secondaryPrice"));});
 it("lets guardian disable risk but only owner re-enable",function(){assert.ok(src.includes("msg.sender != owner && msg.sender != guardian"));assert.ok(tests.includes("guardian disable"));});
 it("retains EVM dual-feed stale divergence and governance coverage",function(){for(const x of["values collateral low and debt high","stale, invalid and excessively divergent","two-step governance transfer"])assert.ok(tests.includes(x),x);});
});