import assert from "node:assert/strict";
import fs from "node:fs";

describe("Router 2.0 Proof Gateway monitor report verifier page",function(){
  const js=fs.readFileSync(new URL("../app/router2-proof-gateway-report-verify-testnet.js",import.meta.url),"utf8"),html=fs.readFileSync(new URL("../app/router2-proof-gateway-report-verify-testnet.html",import.meta.url),"utf8");
  it("never requests an account and remains read-only",function(){assert.match(html,/계정 연결 요청 없이/);assert.doesNotMatch(js,/eth_requestAccounts|eth_sendTransaction|\.approve\(|getSigner\(/);});
  it("accepts only the exact V2 PASS and FAIL schemas",function(){assert.match(js,/function exactKeys\(value,keys\)/);assert.match(js,/report\.status==="PASS"/);assert.match(js,/report\.status==="FAIL"/);assert.match(js,/LQC_PROOF_GATEWAY_MONITOR_V2/);});
  it("strictly validates addresses hashes integers and text",function(){assert.match(js,/ADDRESS\.test\(value\)/);assert.match(js,/HASH\.test\(value\)/);assert.match(js,/Number\.isSafeInteger/);assert.match(js,/value\.length>500/);});
  it("requires PASS reports to retain zero residuals and unpaused Risk",function(){assert.match(js,/report\.riskPaused!==false/);assert.match(js,/report\.gatewayBalance!=="0"/);assert.match(js,/report\.routerAllowance!=="0"/);});
  it("recomputes and compares the canonical Report Hash",function(){assert.match(js,/keccak256\(ethers\.toUtf8Bytes\(JSON\.stringify\(core\)\)\)/);assert.match(js,/computed\.toLowerCase\(\)!==report\.reportHash\.toLowerCase\(\)/);});
  it("supports clipboard paste without persisting untrusted input",function(){assert.match(js,/navigator\.clipboard\.readText\(\)/);assert.doesNotMatch(js,/localStorage\.setItem|sessionStorage\.setItem/);});
  it("separates hash validity from fifteen-minute operational freshness",function(){assert.match(js,/MAX_AGE_MS=15\*60\*1000/);assert.match(js,/age<=MAX_AGE_MS/);assert.match(js,/Report Hash는 일치하지만 15분이 지난 기록입니다/);assert.match(html,/시간 신선도/);});
  it("rejects reports dated more than five minutes in the future",function(){assert.match(js,/MAX_FUTURE_MS=5\*60\*1000/);assert.match(js,/age < -MAX_FUTURE_MS/);});
  it("pins PASS reports to the reviewed Router and LQC Flow Adapter",function(){assert.match(js,/ROUTER="0x2e0a7f59ca65ed36977add5e71b8b64ba38d939f"/);assert.match(js,/ADAPTER="0x14db750acf95b469aba3e74032e6db61087ef4cd"/);assert.match(js,/report\.executionRouter\.toLowerCase\(\)!==ROUTER/);});
  it("recomputes the block-bound Snapshot Hash from every safety field",function(){assert.match(js,/function verifyPassBindings\(report\)/);assert.match(js,/solidityPackedKeccak256/);assert.match(js,/BigInt\(report\.gatewayBalance\)/);assert.match(js,/computed\.toLowerCase\(\)!==report\.snapshotHash\.toLowerCase\(\)/);});
  it("requires a locally verified PASS report before live checking",function(){assert.match(js,/let verifiedReport=null/);assert.match(js,/report\?\.status!=="PASS"/);assert.match(js,/먼저 PASS 운영점검 JSON/);});
  it("checks live runtime hashes immutable bindings and current safety state",function(){assert.match(js,/PROOF_RUNTIME_HASH/);assert.match(js,/GATEWAY_RUNTIME_HASH/);assert.match(js,/gateway\.proofVerifier\(\)/);assert.match(js,/registry\.getDex\(FLOW\)/);assert.match(js,/risk\.paused\(\)/);assert.match(js,/token\.allowance\(report\.proofGateway,ROUTER\)/);});
  it("checks the last nonzero proof remains consumed without sending a transaction",function(){assert.match(js,/report\.lastProof!==ethers\.ZeroHash/);assert.match(js,/gateway\.consumedProof\(report\.lastProof\)/);assert.match(html,/현재 온체인 교차검증/);});
  it("binds the claimed check time to the report block timestamp",function(){assert.match(js,/provider\.getBlock\(report\.blockNumber\)/);assert.match(js,/Math\.abs\(reportBlock\.timestamp\*1000-report\.checkedAt\)/);assert.match(js,/timestampGap>10\*60\*1000/);});
  it("rejects future blocks and displays current confirmations",function(){assert.match(js,/report\.blockNumber>blockNumber/);assert.match(js,/confirmations=blockNumber-report\.blockNumber\+1/);assert.match(js,/보고서 블록 확인/);});
  it("requires and seals the report block hash into the V2 snapshot",function(){assert.match(js,/hash\(report\.blockHash,"조회 블록"\)/);assert.match(js,/\["uint256","uint256","bytes32"/);assert.match(js,/report\.blockHash,report\.proofVerifier/);});
  it("rejects a report block hash that is no longer canonical",function(){assert.match(js,/reportBlock\.hash\.toLowerCase\(\)!==report\.blockHash\.toLowerCase\(\)/);assert.match(js,/보고서 블록 해시가 현재 체인과 일치하지 않습니다/);});
});
