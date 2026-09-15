import assert from "node:assert/strict";
import fs from "node:fs";

describe("Router 2.0 Proof Gateway workflow page",function(){
  const js=fs.readFileSync(new URL("../app/router2-proof-gateway-workflow-testnet.js",import.meta.url),"utf8"),html=fs.readFileSync(new URL("../app/router2-proof-gateway-workflow-testnet.html",import.meta.url),"utf8");
  it("contains all six ordered workflow stages",function(){for(let i=1;i<=6;i++)assert.match(html,new RegExp(">"+i+"\\. "));for(const page of ["proof-verifier-deploy","proof-gateway-deploy","proof-gateway-final-state","proof-gateway-readiness","proof-gateway-execution-testnet","proof-gateway-execution-final"])assert.ok(js.includes(page),page);});
  it("maps every stage to its exact persistent evidence key",function(){for(const key of ["proof-verifier-chain97-v1","proof-gateway-chain97-v1","proof-gateway-final-chain97-v1","proof-gateway-readiness-chain97-v1","proof-gateway-execution-chain97-v1","proof-gateway-execution-final-chain97-v1"])assert.ok(js.includes(key),key);});
  it("locks every stage behind its predecessor",function(){assert.match(js,/gateway:done\.proof/);assert.match(js,/deploymentFinal:done\.proof&&done\.gateway/);assert.match(js,/readiness:done\.deploymentFinal/);assert.match(js,/execution:done\.execution\|\|done\.readiness/);assert.match(js,/executionFinal:done\.execution/);});
  it("treats expired readiness evidence as incomplete",function(){assert.match(js,/Number\(records\.readiness\.validUntil\)\*1000>Date\.now\(\)/);assert.match(js,/만료됨 · 다시 검증/);});
  it("is read-only and delegates on-chain checks to each stage",function(){assert.match(html,/각 단계 화면이 실제 온체인 상태를 다시 검증합니다/);assert.doesNotMatch(js,/eth_sendTransaction/);assert.doesNotMatch(js,/window\.ethereum/);});
  it("warns against duplicate execution after completion",function(){assert.match(js,/같은 실행을 다시 하지 마세요/);assert.match(html,/위에서부터 진행 가능한 단계 하나만 실행하세요/);});
  it("archives a completed execution before starting a new trade cycle",function(){assert.match(js,/HISTORY_KEY="lqc-router2-proof-gateway-execution-history-chain97-v1"/);assert.match(js,/history\.push\(\{archivedAt:Date\.now\(\),transactionHash:execution\.transactionHash/);assert.match(js,/history\.slice\(-MAX_HISTORY\)/);assert.match(html,/새 거래 주기 시작/);});
  it("preserves deployment records and clears only the three execution-cycle records",function(){assert.match(js,/\[KEYS\.readiness,KEYS\.execution,KEYS\.executionFinal\]/);assert.doesNotMatch(js,/removeItem\(KEYS\.proof\)|removeItem\(KEYS\.gateway\)|removeItem\(KEYS\.deploymentFinal\)/);assert.match(js,/최종검증까지 완료된 거래만 새 주기로 전환/);});
  it("requires explicit confirmation and never sends a wallet transaction",function(){assert.match(js,/if\(!confirm\(/);assert.doesNotMatch(js,/eth_sendTransaction|eth_requestAccounts|window\.ethereum/);});
});
