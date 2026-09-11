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
    assert.match(app, /gasProbe=await simulateApprovalTransaction\(base,150000n\)/);
    assert.match(app, /finalSimulation=await simulateApprovalTransaction\(request,150000n\)/);
    assert.match(app, /readProviders\[index\]\.call\(callRequest\)/);
    assert.match(app, /consensusTransactionCount\(\)/);
    assert.match(app, /consensusFeeFields\(\)/);
    assert.match(app, /ApprovalNonceChangedBeforeSigning/);
  });

  it("submits only the immutable prepared approval request", function () {
    assert.match(app, /request=Object\.freeze\(\{\.\.\.base,\.\.\.fees,gasLimit:gasProbe\.gasLimit,nonce\}\)/);
    assert.match(app, /transaction=await signer\.sendTransaction\(request\)/);
    assert.match(app, /Object\.freeze\(\{binding,context,reservation,transaction\}\)/);
    assert.match(app, /approvedSpenders=new Set\(\[cfg\.executionRouterAddress,cfg\.autoRouterAddress,cfg\.nativeRouterAddress\]/);
    assert.match(app, /!approvedSpenders\.has\(spender\.toLowerCase\(\)\)/);
    assert.equal((app.match(/await approveAndVerifyToken\(token,spender,value,walletContext\)/g)||[]).length,2);
    assert.equal((app.match(/if\(allowance>0n\)await approveAndVerifyToken\(token,spender,0n,walletContext\)/g)||[]).length,2);
  });

  it("revalidates the bound wallet immediately before approval signing", function () {
    assert.match(app, /provider\.getTransactionCount\(walletContext\.account,'pending'\)\]\);await assertWalletContext\(walletContext\);if\(finalNonce!==request\.nonce/);
    assert.match(app, /execution:\{sender:walletContext\.account,router:tokenAddress\.toLowerCase\(\),kind:'single'\}/);
    assert.match(app, /if\(!chartHealth\.transactionMatches\(binding,request\)\)throw new Error\('ApprovalTransactionChangedBeforeSigning'\)/);
  });
  it("requires a successful receipt and multi-RPC allowance consensus", function () {
    assert.match(app, /verifyCanonicalApproval\(transactionHash,prepared\.binding,prepared\.context\)/);
    assert.match(app, /chartHealth\.decodeApprovalValue\(receipt,eventContext\)/);
    assert.match(app, /approvalValue!==approvalContext\.amount/);
    assert.match(app, /readProviders\[index\]/);
    assert.match(app, /boundOwner=owner\.toLowerCase\(\)/);
    assert.match(app, /token\.allowance\(boundOwner,spender\)/);
    assert.match(app, /TokenAllowanceConsensusFailed/);
    assert.match(app, /chartHealth\.consensusObservedTokenAllowance\(observations,readProviders\.length\)/);
    assert.equal((app.match(/allowance=await readTokenAllowance\(tokenIn\.address,spender\)/g)||[]).length,2);
  });

  it("binds post-approval allowance verification to the original wallet", function () {
    assert.match(app, /verifyTokenAllowance\(tokenAddress,spender,value,walletContext\.account\);await assertWalletContext\(walletContext\)/);
    assert.match(app, /if\(!ethers\.isAddress\(owner\)\)throw new Error\('InvalidAllowanceOwner'\)/);
  });

  it("persists and recovers approvals before allowing a swap", function () {
    assert.match(app, /pendingApprovalActive\|\|!pending\|\|!deployed\|\|blockRecoveryForSigningReservation\(\)/);
    assert.match(app, /catch\{if\(blockRecoveryForSigningReservation\(\)\)return false;try\{if\(!pending\.cancellationHash\)/);
    assert.match(app, /rememberPendingApproval\(submittedHash,prepared\.binding,prepared\.context\)/);
    assert.match(app, /if\(transactionHash!==submittedHash\)rememberPendingApproval\(transactionHash,prepared\.binding,prepared\.context,submittedHash\)/);
    assert.match(app, /verifyCanonicalApproval\(pending\.transactionHash,pending\.anchorQuote,pending\.settlementContext\)/);
    assert.match(app, /verifyTokenAllowance\(context\.token,context\.spender,context\.amount,context\.owner\)/);
    assert.match(app, /if\(blockRecoveryForSigningReservation\(\)\|\|!clearPendingApproval\(pending\.transactionHash,pending\)\)throw new Error\('PendingApprovalStorageConflict'\)/);
    assert.match(app, /status\.approvalCancellationRecovered[^\n]*resumeRecoveryAfterSigningReservation\(\);return true/);
    assert.match(app, /status\.approvalRecovered[^\n]*resumeRecoveryAfterSigningReservation\(\);return true/);
    assert.match(app, /status\.approvalFailureRecovered[^\n]*resumeRecoveryAfterSigningReservation\(\);return true/);
    assert.match(app, /finally\{pendingApprovalActive=false;if\(canReleaseSwapLock\(\)\)setSwapInFlight\(false\)\}/);
  });

  it("fails closed for changed or cancelled persisted approvals", function () {
    assert.match(app, /approvalInterface\.decodeFunctionData\('approve',binding\.transaction\.data\)/);
    assert.match(app, /chartHealth\.transactionMatches\(binding,binding\.transaction\)/);
    assert.match(app, /approvalRecoveryStore\.rememberCancellation\(submittedHash,error\.replacementHash\)/);
    assert.match(app, /verifyCancelledSubmittedTransaction\(pending\.cancellationHash,pending\.anchorQuote\)/);
    assert.match(app, /pendingApprovalRecord\.state==='invalid'/);
  });

  it("durably reserves an approval before opening the wallet", function () {
    assert.match(app, /approvalReservationStore\.reserve\(binding,context\)/);
    assert.match(app, /const transaction=await signer\.sendTransaction\(request\)/);
    assert.match(app, /rememberPendingApproval\(submittedHash,prepared\.binding,prepared\.context\);if\(!approvalReservationStore\.clear\(prepared\.reservation\)\)/);
    assert.match(app, /error\?\.code==='ACTION_REJECTED'\|\|error\?\.code===4001/);
    assert.match(app, /clearedReservedApproval=recoverableReservedApproval&&approvalReservationStore\.clear\(approvalReservationRecord\.serialized\)/);
    assert.match(app, /approvalReservationRecord\.state!=='none'&&!clearedReservedApproval/);
    assert.match(app, /approvalReservationMatchesPending\(approvalReservationRecord\.value,pendingApprovalRecord\.value\)/);
    assert.match(app, /function resumeRecoveryAfterSigningReservation\(\)[^{]*\{if\(blockRecoveryForSigningReservation\(\)\)return;const approval=pendingApprovalState\(\),execution=pendingExecutionState\(\)/);
    assert.match(app, /approval\.state==='invalid'[^\n]*status\(t\('status\.pendingApprovalInvalid'\)/);
    assert.match(app, /approval\.state==='valid'[^\n]*recoverPendingApproval\(\)/);
    assert.match(app, /function handleApprovalReservationStorage\(event\)[^\n]*const record=approvalReservationState\(\);if\(record\.state==='none'\)\{resumeRecoveryAfterSigningReservation\(\);return\}/);
    assert.match(app, /function handleExecutionReservationStorage\(event\)[^\n]*const record=executionReservationState\(\);if\(record\.state==='none'\)\{resumeRecoveryAfterSigningReservation\(\);return\}/);
    assert.doesNotMatch(app, /record\.state==='none'&&event\.newValue===null/);
    assert.match(app, /approvalReservationState\(\)\.state==='none'&&executionReservationState\(\)\.state==='none'/);
    assert.match(app, /else if\(approvalReservationState\(\)\.state!=='none'\)\{const state=approvalReservationState\(\)/);
  });

  it("requires the approved allowance to equal the requested trade amount", function () {
    const health = fs.readFileSync(path.resolve(import.meta.dirname, "../app/chart-health.js"), "utf8");
    assert.match(health, /consensus\?\.allowance===requiredAmount\?consensus:null/);
  });

  it("revokes stale Router allowances whenever approval-time routing changes", function () {
    assert.match(app, /if\(refreshedSpender\.toLowerCase\(\)!==spender\.toLowerCase\(\)\)\{await approveAndVerifyToken\(token,spender,0n/);
    assert.match(app, /if\(finalSpender\.toLowerCase\(\)!==spender\.toLowerCase\(\)\)\{await approveAndVerifyToken\(token,spender,0n[\s\S]*RouteChangedDuringApproval/);
  });

  it("verifies the exact submitted approval and three-block canonical receipt", function () {
    assert.match(app, /chartHealth\.bindTransaction\(\{request:\{chainId:cfg\.chainId,amountIn:value\|\|1n\}/);
    assert.match(app, /consensusSubmittedTransaction\(binding,observations,readProviders\.length,transactionHash\)/);
    assert.match(app, /consensusTransactionReceipt\(observations\.filter\(item=>indexes\.has\(item\.index\)\),readProviders\.length,transactionHash,requiredConfirmations\)/);
    assert.match(app, /waitForFinalTransactionHash\(prepared\.transaction\)/);
  });

  it("clears only the approval record captured before receipt verification", function () {
    assert.match(app, /const expectedPending=storedPendingApproval\(\);if\(!expectedPending\)throw new Error\('PendingApprovalStorageConflict'\);const receipt=await verifyCanonicalApproval/);
    assert.match(app, /clearPendingApproval\(transactionHash,expectedPending\)/);
  });

});
