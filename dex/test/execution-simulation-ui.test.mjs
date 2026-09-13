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
});
