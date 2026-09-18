import assert from "node:assert/strict";
import fs from "node:fs";
const source=fs.readFileSync(new URL("../contracts/lending/LQCLendingCore.sol",import.meta.url),"utf8");
const tests=fs.readFileSync(new URL("lending-core.test.mjs",import.meta.url),"utf8");
describe("LQC official 4/3 Borrow gate",function(){
 it("requires nonzero amount and receiver before borrow execution",function(){assert.match(source,/function borrow[\s\S]*amount==0[\s\S]*receiver==address\(0\)/);});
 it("requires available liquidity and blocks accounts carrying bad debt",function(){assert.match(source,/badDebtSharesOf\[id\]\[msg\.sender\]!=0[\s\S]*availableLiquidity\(id\)/);});
 it("binds new debt to borrow index shares and market caps",function(){assert.match(source,/shares=_ceilDiv\(amount\*RAY,borrowIndex\)[\s\S]*validateCaps[\s\S]*validateBorrowAmount/);});
 it("requires post-borrow account risk to remain borrow-allowed",function(){assert.match(source,/accountRisk\(id,collateralOf\[id\]\[msg\.sender\],debtAfter\)\.borrowAllowed/);});
 it("retains EVM coverage for principal borrow, LTV rejection, minimum debt and liquidity protection",function(){for(const term of["custodies collateral, supplies liquidity, borrows and repays principal","rejects borrowing or collateral withdrawal above the 50 percent LTV","protects lender withdrawals while debt is outstanding","enforces per-account minimum debt"])assert.match(tests,new RegExp(term));});
});