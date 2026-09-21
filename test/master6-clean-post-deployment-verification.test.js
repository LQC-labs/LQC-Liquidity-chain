import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const script=fs.readFileSync("dex/scripts/verify-master6-clean-post-deployment.mjs","utf8");
const evidence=JSON.parse(fs.readFileSync("dex/deployments/master6-clean-post-deployment-evidence-bsc-testnet-97.json","utf8"));

test("Master 6 post-deployment evidence freezes exactly ten sequential CREATE transactions",()=>{
  assert.equal(evidence.transactions.length,10);
  assert.equal(evidence.startingNonce,"17");
  assert.equal(evidence.finalPendingNonce,"27");
  assert.equal(evidence.activationAuthorized,false);
  assert.equal(evidence.status,"CHAIN_VERIFIED_10_OF_10");
  assert.match(evidence.verificationDigest,/^sha256:[0-9a-f]{64}$/);
  evidence.transactions.forEach((tx,i)=>{
    assert.equal(tx.order,i+1);
    assert.equal(tx.nonce,String(17+i));
    assert.match(tx.hash,/^0x[0-9a-f]{64}$/);
  });
});

test("Master 6 post-deployment verifier is read-only and fail-closed",()=>{
  assert.match(script,/resolveTransactionHashes/);
  assert.match(script,/eth_getBlockByNumber/);
  assert.match(script,/getTransactionReceipt/);
  assert.match(script,/getTransactionCount/);
  assert.match(script,/getCode/);
  assert.match(script,/sha256\(tx\.data\)!==d\.initCodeDigest/);
  assert.match(script,/Final deployer pending nonce is not 27/);
  assert.match(script,/Multi-RPC post-deployment disagreement/);
  assert.match(script,/Market configured before governance gate/);
  assert.match(script,/activationAuthorized:false/);
  assert.doesNotMatch(script,/sendTransaction|eth_sendTransaction|wallet|privateKey|signer/);
});

test("Master 6 verifier validates zero-padded TokenPocket first hash against chain evidence",()=>{
  assert.match(script,/const paddedCandidate="0x0"\+displayedFirst/);
  assert.match(script,/candidateTx\.nonce===17/);
  assert.match(script,/candidateReceipt\.contractAddress/);
  assert.match(script,/sha256\(candidateTx\.data\)===live\.packet\.deployments\[0\]\.initCodeDigest/);
});
