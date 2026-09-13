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
    assert.match(app, /activeSigner\.sendTransaction\(transaction\)/);
    assert.match(app, /executionTransaction=\{\.\.\.\(await buildExecutionTransaction\(/);
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
    const waitIndex = app.indexOf("const receipt=await tx.wait()");
    const validateIndex = app.indexOf("sdk.validateSwapReceipt(receipt,tx.hash,ethers)", waitIndex);
    const completeIndex = app.indexOf("status(t('tradeComplete'", validateIndex);
    assert.ok(waitIndex >= 0 && waitIndex < validateIndex && validateIndex < completeIndex);
  });

  it("persists an unconfirmed swap and blocks accidental resubmission", function () {
    assert.match(app, /rememberPendingSwap\(tx\)/);
    assert.match(app, /if\(await blockIfPendingSwap\(\)\)return/);
    assert.match(app, /provider\.getTransactionReceipt\(pending\.hash\)/);
    assert.match(app, /clearPendingSwap\(tradeAccount\)/);
    assert.match(app, /localStorage\.setItem\(pendingSwapKey\(account\)/);
  });

  it("blocks swaps when the network reports an earlier pending nonce", function () {
    assert.match(app, /getTransactionCount\(account,'latest'\)/);
    assert.match(app, /getTransactionCount\(account,'pending'\)/);
    assert.match(app, /pendingNonce>latestNonce/);
    assert.match(app, /blockIfPendingSwap\(\)\|\|await blockIfNetworkTransactionPending\(\)/);
    assert.match(app, /pendingCheckFailed/);
  });

  it("links submitted and pending transactions to the configured explorer", function () {
    assert.match(app, /cfg\.blockExplorerUrls\[0\].+\/tx\/\$\{hash\}/);
    assert.match(app, /link\.target='_blank'/);
    assert.match(app, /link\.rel='noopener noreferrer'/);
    assert.match(app, /viewTransaction/);
  });

  it("checks token input and native gas funds before simulation and submission", function () {
    assert.match(app, /async function validateFunds\(transaction,value\)/);
    assert.match(app, /provider\.estimateGas\(\{\.\.\.transaction,from:account\}\)/);
    assert.match(app, /sdk\.validateTransactionFunds\(\{nativeBalance,tokenBalance,amountIn:value,estimatedGas/);
    assert.ok(app.indexOf("await validateFunds(executionTransaction,value)") < app.indexOf("await simulateExecution(executionTransaction)"));
  });

  it("uses exact token approvals and validates every approval receipt", function () {
    assert.match(app,/async function approveExact\(token,spender,allowance,value,expectedAccount\)/);
    assert.match(app,/sdk\.exactApprovalAmounts\(allowance,value\)/);
    assert.match(app,/sdk\.validateSwapReceipt\(receipt,tx\.hash,ethers\)/);
    assert.equal((app.match(/await approveExact\(token,spender,allowance,value,tradeAccount\)/g)||[]).length,2);
  });

  it("estimates funds and simulates each approval before asking the wallet to submit", function () {
    assert.match(app,/token\.approve\.populateTransaction\(spender,amount\)/);
    const approval=app.slice(app.indexOf("async function approveExact"),app.indexOf("async function submitExecution"));
    assert.ok(approval.indexOf("await validateFunds(transaction,value)")<approval.indexOf("await simulateExecution(transaction)"));
    assert.ok(approval.indexOf("await simulateExecution(transaction)")<approval.indexOf("token.runner.sendTransaction(transaction)"));
  });

  it("blocks duplicate submissions and locks mutable trade controls in flight", function () {
    assert.match(app,/swapInFlight=false/);
    assert.match(app,/if\(swapInFlight\)return;swapInFlight=true;lockTradeControls\(true\)/);
    for(const control of["ui.amountIn","ui.slippage","ui.tokenInButton","ui.tokenOutButton","ui.flip","ui.max","ui.buy","ui.sell","ui.quick"])
      assert.match(app,new RegExp(control.replace(".","\\.")));
    assert.match(app,/finally\{swapInFlight=false;lockTradeControls\(false\)\}/);
  });

  it("pins the starting account, recipient, signer, and chain through execution", function () {
    assert.match(app,/const tradeAccount=account,tradeSigner=signer/);
    assert.match(app,/sdk\.validateExecutionSession\(expectedAccount,accounts,chainId,cfg\.chainIdHex,ethers\)/);
    assert.match(app,/buildExecutionTransaction\(plan,value,path,deadline,bps,tradeAccount\)/);
    assert.match(app,/submitExecution\(executionTransaction,tradeSigner\)/);
    assert.ok((app.match(/validateWalletExecutionSession\(tradeAccount\)/g)||[]).length>=3);
  });

  it("pins and revalidates the pending nonce for approvals and swaps", function () {
    assert.match(app,/getTransactionCount\(expectedAccount,'pending'\)/);
    assert.match(app,/getTransactionCount\(tradeAccount,'pending'\)/);
    assert.ok((app.match(/sdk\.validatePendingNonce\(nonce,await provider\.getTransactionCount\(/g)||[]).length>=2);
    assert.match(app,/executionTransaction=\{\.\.\.\(await buildExecutionTransaction\(.+\),nonce\}/);
  });
});
