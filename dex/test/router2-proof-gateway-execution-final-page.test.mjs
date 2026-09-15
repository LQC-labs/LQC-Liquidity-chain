import assert from "node:assert/strict";
import fs from "node:fs";

describe("Router 2.0 Proof Gateway execution final-state page",function(){
  const js=fs.readFileSync(new URL("../app/router2-proof-gateway-execution-final-testnet.js",import.meta.url),"utf8"),html=fs.readFileSync(new URL("../app/router2-proof-gateway-execution-final-testnet.html",import.meta.url),"utf8");
  it("is strictly read-only",function(){assert.match(html,/기존 성공 거래만 읽습니다/);assert.doesNotMatch(js,/eth_sendTransaction/);assert.doesNotMatch(js,/\.approve\(/);});
  it("verifies receipt transaction sender target value and runtime code",function(){for(const term of ["getTransactionReceipt","getTransaction(","receipt.status!==1","transaction.value!==0n","GATEWAY_RUNTIME_HASH"])assert.ok(js.includes(term));});
  it("decodes and constrains the exact execution calldata",function(){assert.match(js,/parseTransaction/);assert.match(js,/parsed\.name!=="executeBestCandidate"/);for(const term of ["requestData.chainId!==97n","requestData.amountIn!==AMOUNT","requestData.recipient.toLowerCase()!==SIGNER","routes.length!==candidates.length"])assert.ok(js.includes(term));});
  it("recomputes proof hash from calldata",function(){assert.match(js,/bestCandidateProofHash\(requestData,candidates,selectedIndex\)/);assert.match(js,/proofHash\.toLowerCase\(\)!==sent\.proofHash\.toLowerCase\(\)/);});
  it("decodes and verifies the canonical Gateway event",function(){assert.ok(js.includes("ProofBoundSwapExecuted"));for(const term of ["event.args.proofHash","event.args.sender","event.args.dexId","event.args.amountIn","event.args.amountOut"])assert.ok(js.includes(term));});
  it("requires consumed proof and zero residual allowance",function(){assert.match(js,/gateway\.consumedProof\(proofHash\)/);assert.match(js,/token\.allowance\(SIGNER,deployment\.proofGateway\)!==0n/);});
  it("records block confirmations and deterministic evidence",function(){assert.match(js,/solidityPackedKeccak256/);assert.match(js,/localStorage\.setItem\(FINAL_EXECUTION_KEY/);assert.match(js,/confirmations\.toString\(\)/);});
});
