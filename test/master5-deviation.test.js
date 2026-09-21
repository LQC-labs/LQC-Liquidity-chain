import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("Master 5/6 deviation is bounded, normalized and fail-closed",()=>{
 const oracle=fs.readFileSync("dex/contracts/lending/LQCOracleManager.sol","utf8");
 const doc=fs.readFileSync("docs/master5/5-6-deviation.md","utf8");
 assert.match(oracle,/MAX_DEVIATION_BPS = 2_000/);
 assert.match(oracle,/maxDeviationBps == 0/);
 assert.match(oracle,/maxDeviationBps > MAX_DEVIATION_BPS/);
 assert.match(oracle,/uint256 primaryPrice = _read/);
 assert.match(oracle,/uint256 secondaryPrice = _read/);
 assert.match(oracle,/\(debtPrice - collateralPrice\) \* BPS > collateralPrice \* config\.maxDeviationBps/);
 assert.match(oracle,/revert ExcessiveDeviation\(\)/);
 assert.match(doc,/cannot silently fall back to one feed/);
 assert.match(doc,/activationAuthorized: false/);
});
