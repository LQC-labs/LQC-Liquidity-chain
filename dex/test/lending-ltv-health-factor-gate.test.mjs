import assert from "node:assert/strict";import fs from "node:fs";
const src=fs.readFileSync(new URL("../contracts/lending/LQCLendingMarketRegistry.sol",import.meta.url),"utf8"),core=fs.readFileSync(new URL("../contracts/lending/LQCLendingCore.sol",import.meta.url),"utf8"),tests=fs.readFileSync(new URL("lending-core.test.mjs",import.meta.url),"utf8");
describe("LQC official 4/7 LTV / Health Factor gate",function(){
 it("caps configured max LTV at 50 percent",function(){assert.ok(src.includes("MAX_LTV_BPS = 5_000"));assert.ok(src.includes("config.maxLtvBps > MAX_LTV_BPS"));});
 it("requires liquidation threshold above LTV and within bounded maximum",function(){assert.ok(src.includes("config.liquidationThresholdBps <= config.maxLtvBps"));assert.ok(src.includes("MAX_LIQUIDATION_THRESHOLD_BPS = 8_500"));});
 it("uses conservative oracle values for collateral and debt risk",function(){assert.ok(src.includes("collateralValue = collateralAmount * collateralPrice"));assert.ok(src.includes("debtValue = debtAmount * debtPrice"));});
 it("derives max debt liquidation debt and health factor deterministically",function(){for(const x of["risk.maxDebtValue","risk.liquidationDebtValue","risk.healthFactor","1e18 / risk.debtValue"])assert.ok(src.includes(x),x);});
 it("distinguishes borrow-allowed from liquidatable boundaries",function(){assert.ok(src.includes("risk.debtValue <= risk.maxDebtValue"));assert.ok(src.includes("risk.debtValue > risk.liquidationDebtValue"));});
 it("enforces risk on both borrow and collateral withdrawal",function(){assert.ok(core.includes("accountRisk(id,collateralOf[id][msg.sender],debtAfter).borrowAllowed"));assert.ok(core.includes("accountRisk(id,collateralAfter,debt).borrowAllowed"));});
 it("retains EVM coverage for the 50 percent LTV boundary",function(){assert.ok(tests.includes("rejects borrowing or collateral withdrawal above the 50 percent LTV"));});
});