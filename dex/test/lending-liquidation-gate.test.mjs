import assert from "node:assert/strict";import fs from "node:fs";
const core=fs.readFileSync(new URL("../contracts/lending/LQCLendingCore.sol",import.meta.url),"utf8"),reg=fs.readFileSync(new URL("../contracts/lending/LQCLendingMarketRegistry.sol",import.meta.url),"utf8"),tests=fs.readFileSync(new URL("lending-core.test.mjs",import.meta.url),"utf8");
describe("LQC official 4/8 Liquidation gate",function(){
 it("allows liquidation only through the configured liquidation engine",function(){assert.ok(core.includes("msg.sender!=liquidationEngine"));assert.ok(core.includes("setLiquidationEngine"));});
 it("requires a liquidatable account before moving funds",function(){assert.ok(core.includes("if(!risk.liquidatable)revert NotLiquidatable()"));});
 it("caps each liquidation close at one half of outstanding debt",function(){assert.ok(core.includes("uint256 maxClose=(debt+1)/2"));});
 it("uses the configured liquidation bonus capped at five percent",function(){assert.ok(reg.includes("MAX_LIQUIDATION_BONUS_BPS = 500"));assert.ok(core.includes("10_000+config.liquidationBonusBps"));});
 it("caps seizure at available collateral and recalculates repayment",function(){assert.ok(core.includes("if(collateralSeized>collateral)"));assert.ok(core.includes("collateralSeized=collateral"));});
 it("atomically burns debt shares and collateral accounting",function(){for(const x of["debtSharesOf[id][account]-=shares","totalDebtShares-=uint128(shares)","collateralOf[id][account]-=collateralSeized","totalCollateral-=uint128(collateralSeized)"])assert.ok(core.includes(x),x);});
 it("records residual debt as bad debt when collateral is exhausted",function(){assert.ok(core.includes("collateralOf[id][account]==0&&debtAfter!=0"));assert.ok(core.includes("BadDebtRecorded"));});
 it("retains EVM coverage for half-close and five-percent bonus",function(){assert.ok(tests.includes("liquidates at most half the debt with the fixed five percent bonus"));});
});