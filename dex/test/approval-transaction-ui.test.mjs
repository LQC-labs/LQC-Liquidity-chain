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
    assert.match(app, /return signer\.sendTransaction\(request\)/);
    assert.equal((app.match(/submitTokenApproval\(token,spender,value,walletContext,plan\.anchorQuote\)/g)||[]).length,2);
  });
});
