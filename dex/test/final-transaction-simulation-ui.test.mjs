import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const app = fs.readFileSync(path.resolve(import.meta.dirname, "../app/app.js"), "utf8");

describe("LQC DEX final transaction simulation", function () {
  it("simulates once to size gas and again after nonce, fees, and gas limit are fixed", function () {
    assert.match(app, /gasProbe=await simulateSwapTransaction\(anchorQuote,base,gasCeiling\)/);
    assert.match(app, /request=Object\.freeze\(\{\.\.\.base,\.\.\.fees,gasLimit:gasProbe\.gasLimit,nonce\}\)/);
    assert.match(app, /finalSimulation=await simulateSwapTransaction\(anchorQuote,request,gasCeiling\)/);
  });

  it("rejects a final simulation whose estimate exceeds the immutable gas limit", function () {
    assert.match(app, /finalSimulation\.gasEstimate>request\.gasLimit/);
    assert.match(app, /FinalTransactionGasLimitInsufficient/);
  });

  it("submits only the exact request bound after the final simulation", function () {
    const finalSimulation = app.indexOf("finalSimulation=await simulateSwapTransaction");
    const binding = app.indexOf("chartHealth.bindTransaction(anchorQuote,request)", finalSimulation);
    const submission = app.indexOf("signer.sendTransaction(prepared.request)", binding);
    assert.ok(finalSimulation >= 0 && binding > finalSimulation && submission > binding);
  });
});
