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
    assert.match(app, /context\.provider\.call\(\{\.\.\.transaction,from:context\.account\}\)/);
    assert.match(app, /context\.signer\.sendTransaction\(transaction\)/);
    assert.match(app, /const executionTransaction=await buildExecutionTransaction\(/);
    assert.ok(app.indexOf("await simulateExecution(") < app.indexOf("await submitExecution("));
  });

  it("revalidates the wallet context after simulation and before submission", function () {
    assert.match(app, /walletProvider!==context\.walletProvider/);
    const simulation = app.indexOf("await simulateExecution(executionTransaction,context)");
    const revalidation = app.indexOf("await validateWalletContext(context)", simulation);
    const submission = app.indexOf("await submitExecution(executionTransaction,context)", revalidation);
    assert.ok(simulation < revalidation && revalidation < submission);
  });
});
