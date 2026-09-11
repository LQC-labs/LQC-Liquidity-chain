import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const app = fs.readFileSync(path.resolve(import.meta.dirname, "../app/app.js"), "utf8");

describe("LQC DEX token approval transaction", function () {
  it("populates an exact-value approval without calling the contract send method", function () {
    assert.match(app, /token\.approve\.populateTransaction\(spender,value\)/);
    assert.doesNotMatch(app, /token\.approve\(spender,value\)/);
  });

  it("uses RPC simulation, fee consensus, and nonce consensus before approval signing", function () {
    assert.match(app, /gasProbe=await simulateSwapTransaction\(anchorQuote,base,150000n\)/);
    assert.match(app, /finalSimulation=await simulateSwapTransaction\(anchorQuote,request,150000n\)/);
    assert.match(app, /consensusTransactionCount\(\)/);
    assert.match(app, /consensusFeeFields\(\)/);
    assert.match(app, /ApprovalNonceChangedBeforeSigning/);
  });

  it("submits only the immutable prepared approval request", function () {
    assert.match(app, /request=Object\.freeze\(\{\.\.\.base,\.\.\.fees,gasLimit:gasProbe\.gasLimit,nonce\}\)/);
    assert.match(app, /transaction=await signer\.sendTransaction\(request\)/);
    assert.match(app, /Object\.freeze\(\{binding,transaction\}\)/);
    assert.match(app, /approvedSpenders=new Set\(\[cfg\.executionRouterAddress,cfg\.autoRouterAddress,cfg\.nativeRouterAddress\]/);
    assert.match(app, /!approvedSpenders\.has\(spender\.toLowerCase\(\)\)/);
    assert.equal((app.match(/approveAndVerifyToken\(token,spender,value,walletContext,plan\.anchorQuote\)/g)||[]).length,2);
    assert.equal((app.match(/if\(allowance>0n\)await approveAndVerifyToken\(token,spender,0n,walletContext,plan\.anchorQuote\)/g)||[]).length,2);
  });
  it("requires a successful receipt and multi-RPC allowance consensus", function () {
    assert.match(app, /verifyCanonicalApproval\(transactionHash,prepared\.binding\)/);
    assert.match(app, /readProviders\[index\]/);
    assert.match(app, /token\.allowance\(account,spender\)/);
    assert.match(app, /chartHealth\.consensusTokenAllowance\(observations,readProviders\.length,requiredAmount\)/);
    assert.match(app, /TokenAllowanceConsensusFailed/);
  });

  it("requires the approved allowance to equal the requested trade amount", function () {
    const health = fs.readFileSync(path.resolve(import.meta.dirname, "../app/chart-health.js"), "utf8");
    assert.match(health, /winner\[0\]\.allowance!==requiredAmount/);
  });

  it("verifies the exact submitted approval and three-block canonical receipt", function () {
    assert.match(app, /chartHealth\.bindTransaction\(\{request:\{chainId:cfg\.chainId,amountIn:value\|\|1n\}/);
    assert.match(app, /consensusSubmittedTransaction\(binding,observations,readProviders\.length,transactionHash\)/);
    assert.match(app, /consensusTransactionReceipt\(observations\.filter\(item=>indexes\.has\(item\.index\)\),readProviders\.length,transactionHash,requiredConfirmations\)/);
    assert.match(app, /waitForFinalTransactionHash\(prepared\.transaction\)/);
  });

});
