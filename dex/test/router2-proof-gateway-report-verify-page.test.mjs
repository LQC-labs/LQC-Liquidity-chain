import assert from "node:assert/strict";
import fs from "node:fs";

describe("Router 2.0 Proof Gateway monitor report verifier page",function(){
  const js=fs.readFileSync(new URL("../app/router2-proof-gateway-report-verify-testnet.js",import.meta.url),"utf8"),html=fs.readFileSync(new URL("../app/router2-proof-gateway-report-verify-testnet.html",import.meta.url),"utf8");
  it("is wallet-free and read-only",function(){assert.match(html,/지갑을 연결하지 않고/);assert.doesNotMatch(js,/window\.ethereum|eth_requestAccounts|eth_sendTransaction|\.approve\(/);});
  it("accepts only the exact PASS and FAIL schemas",function(){assert.match(js,/function exactKeys\(value,keys\)/);assert.match(js,/report\.status==="PASS"/);assert.match(js,/report\.status==="FAIL"/);assert.match(js,/LQC_PROOF_GATEWAY_MONITOR_V1/);});
  it("strictly validates addresses hashes integers and text",function(){assert.match(js,/ADDRESS\.test\(value\)/);assert.match(js,/HASH\.test\(value\)/);assert.match(js,/Number\.isSafeInteger/);assert.match(js,/value\.length>500/);});
  it("requires PASS reports to retain zero residuals and unpaused Risk",function(){assert.match(js,/report\.riskPaused!==false/);assert.match(js,/report\.gatewayBalance!=="0"/);assert.match(js,/report\.routerAllowance!=="0"/);});
  it("recomputes and compares the canonical Report Hash",function(){assert.match(js,/keccak256\(ethers\.toUtf8Bytes\(JSON\.stringify\(core\)\)\)/);assert.match(js,/computed\.toLowerCase\(\)!==report\.reportHash\.toLowerCase\(\)/);});
  it("supports clipboard paste without persisting untrusted input",function(){assert.match(js,/navigator\.clipboard\.readText\(\)/);assert.doesNotMatch(js,/localStorage\.setItem|sessionStorage\.setItem/);});
});
