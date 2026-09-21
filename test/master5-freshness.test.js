import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("Master 5/5 freshness is explicit and fail-closed",()=>{
 const oracle=fs.readFileSync("dex/contracts/lending/LQCOracleManager.sol","utf8");
 const boundary=fs.readFileSync("docs/ORACLE_INTERFACE_BOUNDARY.md","utf8");
 const doc=fs.readFileSync("docs/master5/5-5-freshness.md","utf8");
 assert.match(oracle,/maxAge < 60 \|\| maxAge > 2 days/);
 assert.match(oracle,/updatedAt == 0/);
 assert.match(oracle,/updatedAt > block\.timestamp/);
 assert.match(oracle,/block\.timestamp - updatedAt > maxAge/);
 assert.match(oracle,/answeredInRound < roundId/);
 assert.match(boundary,/validate positive price, timestamp, round completeness and freshness/);
 assert.match(doc,/activationAuthorized: false/);
});
