import assert from "node:assert/strict";
import fs from "node:fs";

describe("Router 2.0 Proof Gateway execution-readiness page",function(){
  const js=fs.readFileSync(new URL("../app/router2-proof-gateway-readiness-testnet.js",import.meta.url),"utf8"),html=fs.readFileSync(new URL("../app/router2-proof-gateway-readiness-testnet.html",import.meta.url),"utf8");
  it("is read-only and creates no approval or transaction",function(){assert.match(html,/토큰 승인·스왑·지갑 서명·가스비가 발생하지 않습니다/);assert.doesNotMatch(js,/eth_sendTransaction/);assert.doesNotMatch(js,/\.approve\(/);});
  it("requires the final verified Gateway deployment",function(){assert.ok(js.includes("lqc-router2-proof-gateway-final-chain97-v1"));assert.match(js,/final\?\.proofVerifier/);assert.match(js,/final\?\.proofGateway/);});
  it("binds the reviewed LQC Flow route and current Registry adapter",function(){for(const value of ["0x0465c6460deaece522506e09cddc1b62d6d75c84","0x14db750acf95b469aba3e74032e6db61087ef4cd","0x84a30a66cfcbb15453c83204b7e6ec436a0718fc","0xae13d989dac2f0debff460ac112a837c89baa7cd"])assert.ok(js.includes(value));assert.match(js,/registry\.getDex\(FLOW\)/);});
  it("builds and verifies the quote on the deployed Proof contract",function(){for(const term of ["quoteExactInput","computeRouteHash","verifyBestCandidate","bestCandidateProofHash"])assert.ok(js.includes(term));assert.match(js,/quote\*\(10000n-SLIPPAGE\)\/10000n/);});
  it("requires unused proof, exact zero allowance, balances and ten-minute expiry",function(){assert.match(js,/gateway\.consumedProof\(proofHash\)/);assert.match(js,/allowance!==0n/);assert.match(js,/balance<AMOUNT/);assert.match(js,/block\.timestamp\+600/);});
  it("stores a complete serializable execution package",function(){for(const term of ["request:{","candidates:[","routeData:[routeData]","selectedIndex:0","proofHash"])assert.ok(js.includes(term));assert.match(js,/localStorage\.setItem\(READY_KEY/);});
});
