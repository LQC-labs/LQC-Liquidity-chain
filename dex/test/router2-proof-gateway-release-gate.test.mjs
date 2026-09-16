import assert from "node:assert/strict";
import fs from "node:fs";
import {
  GATE_TESTS,PAGE_SCRIPTS,REVIEWED_PACKAGE_LOCK_BLOB,assertArtifactHashes,
  assertPackageLockBuffer,gitBlobSha,inspectArtifactHashes,
} from "../scripts/run-router2-proof-gateway-gate.mjs";

describe("Router 2.0 Proof Gateway release safety gate",function(){
  it("pins the explicitly preserved package lock Git blob",function(){const content=fs.readFileSync(new URL("../package-lock.json",import.meta.url));assert.equal(gitBlobSha(content),REVIEWED_PACKAGE_LOCK_BLOB);assert.equal(assertPackageLockBuffer(content),"871ba530cf90a09cf0da383799960f443961ae18");assert.throws(()=>assertPackageLockBuffer(Buffer.from("{}")),/package-lock\.json changed/);});
  it("separates current candidate hashes from historical deployed evidence",function(){const state=inspectArtifactHashes(new URL("..",import.meta.url).pathname);for(const hash of Object.values(state.candidate))assert.match(hash,/^0x[0-9a-f]{64}$/);for(const hash of Object.values(state.deployed))assert.match(hash,/^0x[0-9a-f]{64}$/);assert.equal(state.deployed.gatewayCreation,state.deployed.gatewayTemplate);assert.equal(state.redeployRequired,state.drift.length>0);for(const item of state.drift){assert.notEqual(item.deployed,item.candidate);assert.ok(["proofCreation","proofRuntime","gatewayCreation","gatewayRuntime"].includes(item.key));}});
  it("keeps the release assertion blocking while a redeployment is required",function(){const root=new URL("..",import.meta.url).pathname;const state=inspectArtifactHashes(root);if(state.redeployRequired){assert.throws(()=>assertArtifactHashes(root),/testnet redeployment\/review required before release/);}else{const hashes=assertArtifactHashes(root);assert.deepEqual(hashes,state.candidate);}});
  it("covers every Proof Gateway browser script",function(){for(const page of ["proof-verifier-deploy","proof-gateway-deploy","proof-gateway-final-state","proof-gateway-readiness","proof-gateway-execution","proof-gateway-workflow","proof-gateway-evidence-export","proof-gateway-evidence-import"])assert(PAGE_SCRIPTS.some(file=>file.includes(page)),page);assert.equal(new Set(PAGE_SCRIPTS).size,PAGE_SCRIPTS.length);});
  it("includes contract source, adversarial EVM and all workflow tests",function(){for(const test of ["gateway-source","adversarial-mock","gateway-evm","adversarial-evm","gateway-preparation","execution-final","workflow","evidence-export","evidence-import"])assert(GATE_TESTS.some(file=>file.includes(test)),test);assert.equal(new Set(GATE_TESTS).size,GATE_TESTS.length);});
  it("contains no deployment or wallet-send command",function(){const source=fs.readFileSync(new URL("../scripts/run-router2-proof-gateway-gate.mjs",import.meta.url),"utf8");assert.doesNotMatch(source,/eth_sendTransaction|DEPLOYER_PRIVATE_KEY|eth_sendRawTransaction/);assert.match(source,/Local compile and tests only/);});
});
