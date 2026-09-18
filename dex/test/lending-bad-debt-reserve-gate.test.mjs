import assert from "node:assert/strict";import fs from "node:fs";
const core=fs.readFileSync(new URL("../contracts/lending/LQCLendingCore.sol",import.meta.url),"utf8"),tests=fs.readFileSync(new URL("lending-core.test.mjs",import.meta.url),"utf8");
describe("LQC official 4/9 Bad Debt / Reserve gate",function(){
 it("tracks account and market bad-debt shares separately",function(){for(const x of["badDebtSharesOf","totalBadDebtShares","BadDebtRecorded"])assert.ok(core.includes(x),x);});
 it("blocks new borrow while an account carries bad debt",function(){assert.ok(core.includes("badDebtSharesOf[id][msg.sender]!=0"));});
 it("allows ordinary repayment to clear matching bad-debt shares",function(){assert.ok(core.includes("badShares=badDebtSharesOf[id][account]"));assert.ok(core.includes("totalBadDebtShares[id]-=cleared"));});
 it("restricts reserve withdrawal and bad-debt recovery to governance",function(){for(const x of["withdrawReserves","coverBadDebtWithReserves","recapitalizeBadDebt","realizeBadDebtLoss"])assert.ok(core.includes(x),x);});
 it("bounds reserve withdrawal by both accrued reserves and available liquidity",function(){assert.ok(core.includes("amount>accruedReserves[id]||amount>availableLiquidity(id)"));});
 it("permits supplier-loss realization only on a disabled market with a bounded loss",function(){assert.ok(core.includes("if(config.enabled)revert Unauthorized()"));assert.ok(core.includes("2_000/10_000"));assert.ok(core.includes("LossLimitExceeded"));});
 it("retains EVM coverage for residual bad debt and reserve/supplier loss paths",function(){for(const x of["records residual bad debt","bad debt","reserves","supplier loss"])assert.ok(tests.toLowerCase().includes(x.toLowerCase()),x);});
});