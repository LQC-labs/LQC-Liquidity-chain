import assert from "node:assert/strict";
import fs from "node:fs";

describe("Router 2.0 Proof Gateway evidence recovery page",function(){
  const js=fs.readFileSync(new URL("../app/router2-proof-gateway-evidence-import-testnet.js",import.meta.url),"utf8"),html=fs.readFileSync(new URL("../app/router2-proof-gateway-evidence-import-testnet.html",import.meta.url),"utf8");
  it("rebuilds the canonical core before checking Bundle Hash",function(){assert.match(js,/const core=\{schemaVersion:1,network:\{name:"BSC Testnet",chainId:97\},signer:SIGNER,stages\}/);assert.match(js,/Bundle Hash 불일치/);});
  it("strictly validates public addresses hashes and numeric fields",function(){assert.match(js,/\^0x\[0-9a-fA-F\]\{40\}\$/);assert.match(js,/\^0x\[0-9a-fA-F\]\{64\}\$/);assert.match(js,/Number\.isSafeInteger/);assert.match(js,/\^\[0-9\]\+\$/);});
  it("verifies Proof Router Gateway and execution relationships",function(){assert.match(js,/proofGateway\.proofVerifier!==stages\.proofVerifier\.address/);assert.match(js,/proofGateway\.executionRouter!==ROUTER/);assert.match(js,/execution\.gateway!==stages\.proofGateway\.address/);assert.match(js,/executionFinal\.proofHash!==stages\.execution\.proofHash/);});
  it("restores only public deployment and successful execution records",function(){assert.match(js,/setItem\(KEYS\.proof/);assert.match(js,/setItem\(KEYS\.gateway/);assert.match(js,/setItem\(KEYS\.execution/);assert.doesNotMatch(js,/setItem\(KEYS\.readiness/);assert.doesNotMatch(js,/setItem\(KEYS\.executionFinal/);});
  it("forces final and expiring evidence to be reverified",function(){assert.match(js,/removeItem\(KEYS\.deploymentFinal\)/);assert.match(js,/removeItem\(KEYS\.readiness\)/);assert.match(js,/removeItem\(KEYS\.executionFinal\)/);assert.match(html,/3단계 온체인 최종검증을 반드시 다시 실행/);});
  it("requires explicit overwrite confirmation and sends no transaction",function(){assert.match(js,/\$\("confirm"\)\.checked/);assert.match(html,/기존 브라우저 공개 기록 교체를 확인합니다/);assert.doesNotMatch(js,/window\.ethereum|eth_sendTransaction/);});
});
