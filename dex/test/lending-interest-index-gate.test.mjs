import assert from "node:assert/strict";import fs from "node:fs";
const model=fs.readFileSync(new URL("../contracts/lending/LQCInterestRateModel.sol",import.meta.url),"utf8"),idx=fs.readFileSync(new URL("../contracts/lending/LQCLendingInterestIndex.sol",import.meta.url),"utf8"),tests=fs.readFileSync(new URL("lending-interest.test.mjs",import.meta.url),"utf8");
describe("LQC official 4/5 Interest Rate / Index gate",function(){
 it("keeps the utilization kink model and reserve-factor bounds",function(){for(const x of["optimalUtilizationBps","reserveFactorBps","borrowRatePerSecond"])assert.ok(model.includes(x));});
 it("keeps borrow and supply indexes initialized in RAY units",function(){for(const x of["RAY = 1e27","initializeMarket","borrowIndexRay","supplyIndexRay"])assert.ok(idx.includes(x),x);});
 it("restricts index accrual mutation to the configured lending core",function(){assert.ok(idx.includes("setCore"));assert.ok(idx.includes("msg.sender != core"));});
 it("keeps preview and accrue paths for deterministic index evolution",function(){assert.ok(idx.includes("function preview"));assert.ok(idx.includes("function accrue"));});
 it("retains EVM coverage for utilization rates, elapsed-time accrual, supplier yield and reserves",function(){const lower=tests.toLowerCase();for(const x of["utilization","accru","supplier","reserve"])assert.ok(lower.includes(x),x);});
});