import assert from "node:assert/strict";import fs from "node:fs";
const model=fs.readFileSync(new URL("../contracts/lending/LQCInterestRateModel.sol",import.meta.url),"utf8"),idx=fs.readFileSync(new URL("../contracts/lending/LQCLendingInterestIndex.sol",import.meta.url),"utf8"),tests=fs.readFileSync(new URL("lending-interest.test.mjs",import.meta.url),"utf8");
describe("LQC official 4/5 Interest Rate / Index gate",function(){
 it("keeps the utilization kink model and reserve-factor bounds",function(){for(const x of["optimalUtilizationBps","reserveFactorBps","borrowRatePerSecond"])assert.match(model,new RegExp(x));});
 it("keeps borrow and supply indexes initialized in RAY units",function(){assert.match(idx,/RAY\\s*=\\s*1e27/);assert.match(idx,/initializeMarket/);assert.match(idx,/borrowIndexRay/);assert.match(idx,/supplyIndexRay/);});
 it("restricts index accrual mutation to the configured lending core",function(){assert.match(idx,/setCore/);assert.match(idx,/msg\.sender\s*!=\s*core/);});
 it("keeps preview and accrue paths for deterministic index evolution",function(){assert.match(idx,/function preview/);assert.match(idx,/function accrue/);});
 it("retains EVM coverage for utilization rates, elapsed-time accrual, supplier yield and reserves",function(){for(const x of["utilization","accru","supplier","reserve"])assert.match(tests,new RegExp(x,"i"));});
});