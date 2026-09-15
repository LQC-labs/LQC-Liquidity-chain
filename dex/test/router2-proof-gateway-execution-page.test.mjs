import assert from "node:assert/strict";
import fs from "node:fs";

describe("Router 2.0 Proof Gateway execution page",function(){
  const js=fs.readFileSync(new URL("../app/router2-proof-gateway-execution-testnet.js",import.meta.url),"utf8"),html=fs.readFileSync(new URL("../app/router2-proof-gateway-execution-testnet.html",import.meta.url),"utf8");
  it("clearly separates verification approval and execution",function(){assert.match(html,/1\. Proof·견적·잔액 읽기 전용 재검증/);assert.match(html,/2\. Gateway에 정확히 10 tLQC 승인/);assert.match(html,/3\. Proof Gateway LQC Flow 1회 실행/);});
  it("restores only the complete readiness package and final deployment",function(){assert.ok(js.includes("lqc-router2-proof-gateway-readiness-chain97-v1"));assert.ok(js.includes("lqc-router2-proof-gateway-final-chain97-v1"));for(const term of ["request:","candidates:","routes:","selectedIndex:","proofHash:"])assert.ok(js.includes(term));});
  it("revalidates proof hash unused state expiry and live quote",function(){for(const term of ["verifyBestCandidate","bestCandidateProofHash","consumedProof","validUntil","quoteExactInput"])assert.ok(js.includes(term));assert.match(js,/liveQuote<candidates\[selectedIndex\]\.minimumAmountOut/);});
  it("uses an exact Gateway approval and requires it before execution",function(){assert.match(js,/encodeFunctionData\("approve",\[gatewayAddress,AMOUNT\]\)/);assert.match(js,/await allowance\(\)!==AMOUNT/);assert.match(js,/approved!==0n&&approved!==AMOUNT/);});
  it("simulates then sends only the selected Gateway execution",function(){assert.match(js,/encodeFunctionData\("executeBestCandidate"/);assert.match(js,/await provider\.call\(\{from:account,to:gatewayAddress,data\}\)/);assert.match(js,/send\(gatewayAddress,data/);});
  it("verifies output proof consumption and zero residual allowance",function(){assert.match(js,/afterOut<=beforeOut/);assert.match(js,/gatewayContract\.consumedProof\(proofHash\)/);assert.match(js,/await allowance\(\)!==0n/);});
  it("blocks duplicates and stores one successful receipt",function(){assert.match(js,/localStorage\.getItem\(SENT_KEY\)/);assert.match(js,/localStorage\.setItem\(SENT_KEY/);assert.match(html,/다시 실행하지 마세요/);});
});
