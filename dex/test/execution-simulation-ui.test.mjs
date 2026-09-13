import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const app = fs.readFileSync(path.resolve(import.meta.dirname, "../app/app.js"), "utf8");

describe("LQC DEX pre-submission simulation", function () {
  it("builds every supported execution path without submitting it", function () {
    for (const method of ["swapExactNativeForToken", "swapExactTokenForNative", "swapOptimizedExactInput", "swapExactInput"])
      assert.match(app, new RegExp(`${method}\\.populateTransaction\\(`));
  });

  it("simulates and submits the exact same transaction request", function () {
    assert.match(app, /provider\.call\(\{\.\.\.transaction,from:account\}\)/);
    assert.match(app, /signer\.sendTransaction\(transaction\)/);
    assert.match(app, /const executionTransaction=await buildExecutionTransaction\(/);
    assert.ok(app.indexOf("await simulateExecution(") < app.indexOf("await submitExecution("));
  });

  it("revalidates a minimal testnet quote before execution and after token approval", function () {
    assert.match(app, /async function validatedMinimalExecutionPlan\(value,path\)/);
    assert.match(app, /sdk\.validateExecutionQuote\(quoteSnapshot/);
    assert.match(app, /minimalMode\?await validatedMinimalExecutionPlan\(value,path\):await validatedExecutionPlan\(value,path\)/);
    assert.match(app, /if\(minimalMode\)plan=await validatedMinimalExecutionPlan\(value,path\)/);
    assert.match(app, /if\(minimalMode\)\{const min=plan\.minimumOut/);
  });

  it("shows completion only after validating the mined transaction receipt", function () {
    assert.match(app, /const receipt=await tx\.wait\(\);sdk\.validateSwapReceipt\(receipt,tx\.hash,ethers\);status\(t\('tradeComplete'/);
  });

  it("checks token input and native gas funds before simulation and submission", function () {
    assert.match(app, /async function validateFunds\(transaction,value\)/);
    assert.match(app, /provider\.estimateGas\(\{\.\.\.transaction,from:account\}\)/);
    assert.match(app, /sdk\.validateTransactionFunds\(\{nativeBalance,tokenBalance,amountIn:value,estimatedGas/);
    assert.ok(app.indexOf("await validateFunds(executionTransaction,value)") < app.indexOf("await simulateExecution(executionTransaction)"));
  });

  it("uses exact token approvals and validates every approval receipt", function () {
    assert.match(app,/async function approveExact\(token,spender,allowance,value\)/);
    assert.match(app,/sdk\.exactApprovalAmounts\(allowance,value\)/);
    assert.match(app,/sdk\.validateSwapReceipt\(receipt,tx\.hash,ethers\)/);
    assert.equal((app.match(/await approveExact\(token,spender,allowance,value\)/g)||[]).length,2);
  });

  it("estimates funds and simulates each approval before asking the wallet to submit", function () {
    assert.match(app,/token\.approve\.populateTransaction\(spender,amount\)/);
    const approval=app.slice(app.indexOf("async function approveExact"),app.indexOf("async function submitExecution"));
    assert.ok(approval.indexOf("await validateFunds(transaction,value)")<approval.indexOf("await simulateExecution(transaction)"));
    assert.ok(approval.indexOf("await simulateExecution(transaction)")<approval.indexOf("signer.sendTransaction(transaction)"));
  });
});
