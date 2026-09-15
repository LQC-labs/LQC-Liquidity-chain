import assert from "node:assert/strict";
import fs from "node:fs";
describe("Router 2.0 Proof Gateway history receipt independent verifier",function(){
  const js=fs.readFileSync(new URL("../app/router2-proof-gateway-history-receipt-verify-testnet.js",import.meta.url),"utf8"),html=fs.readFileSync(new URL("../app/router2-proof-gateway-history-receipt-verify-testnet.html",import.meta.url),"utf8");
  it("is independent and never requests an account or transaction",function(){assert.match(html,/독립검증 · 거래 없음/);assert.doesNotMatch(js,/eth_requestAccounts|eth_sendTransaction|getSigner\(|localStorage/);});
  it("strictly validates both exact V1 envelopes",function(){assert.match(js,/function exact\(value,keys\)/);assert.match(js,/LQC_PROOF_GATEWAY_EXECUTION_HISTORY_V1/);assert.match(js,/LQC_PROOF_GATEWAY_HISTORY_VERIFICATION_V1/);});
  it("recomputes every archive and the ordered archive root",function(){assert.match(js,/history\.entries\.map\(verifyArchive\)/);assert.match(js,/Archive Hash가 일치하지 않습니다/);assert.match(js,/ethers\.keccak256\(ethers\.concat\(entries\.map\(entry=>entry\.archiveHash\)\)\)/);});
  it("recomputes the verification hash and checks freshness",function(){assert.match(js,/computed\.toLowerCase\(\)!==verificationHash\.toLowerCase\(\)/);assert.match(js,/MAX_AGE_MS=15\*60\*1000/);assert.match(js,/MAX_FUTURE_MS=5\*60\*1000/);});
  it("checks the claimed block remains canonical without signing",function(){assert.match(js,/provider\.getBlock\(receipt\.latestBlockNumber\)/);assert.match(js,/block\.hash\.toLowerCase\(\)!==receipt\.latestBlockHash\.toLowerCase\(\)/);assert.match(js,/confirmations<12/);});
});
