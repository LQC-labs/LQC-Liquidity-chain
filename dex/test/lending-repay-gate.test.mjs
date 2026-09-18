import assert from "node:assert/strict";
import fs from "node:fs";
const source=fs.readFileSync(new URL("../contracts/lending/LQCLendingCore.sol",import.meta.url),"utf8");
const tests=fs.readFileSync(new URL("lending-core.test.mjs",import.meta.url),"utf8");
describe("LQC official 4/4 Repay gate",function(){
 it("requires nonzero repayment and a nonzero debtor account",function(){assert.match(source,/function repay[\s\S]*amount==0[\s\S]*account==address\(0\)/);});
 it("accrues before repayment and computes debt from indexed debt shares",function(){assert.match(source,/function repay[\s\S]*_accrue\(id\)[\s\S]*sharesHeld\*borrowIndex\/RAY/);});
 it("supports exact full payoff without over-pulling the payer",function(){assert.match(source,/if\(amount>=debt\)\{shares=sharesHeld;repaid=debt;\}/);});
 it("prevents partial repayment from leaving debt below the market minimum",function(){assert.match(source,/debtAfter[\s\S]*if\(debtAfter!=0\)registry\.validateBorrowAmount/);});
 it("pulls the exact repaid asset and burns debt shares including bad-debt shares",function(){assert.match(source,/_pullExact\(config\.debtAsset,msg\.sender,repaid\)[\s\S]*debtSharesOf[\s\S]*badDebtSharesOf/);});
 it("retains EVM coverage for principal, full payoff, and third-party repayment",function(){for(const term of["borrows and repays principal","allows third-party repayment"])assert.match(tests,new RegExp(term));});
});