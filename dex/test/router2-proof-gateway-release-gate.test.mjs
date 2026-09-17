import assert from "node:assert/strict";
import fs from "node:fs";
import {
  GATE_TESTS,PAGE_SCRIPTS,REVIEWED_PACKAGE_LOCK_BLOB,assertArtifactHashes,
  assertPackageLockBuffer,gitBlobSha,
} from "../scripts/run-router2-proof-gateway-gate.mjs";

describe("Router 2.0 Proof Gateway release safety gate",function(){
  it("pins the explicitly preserved package lock Git blob",function(){const content=fs.readFileSync(new URL("../package-lock.json",import.meta.url));assert.equal(gitBlobSha(content),REVIEWED_PACKAGE_LOCK_BLOB);assert.equal(assertPackageLockBuffer(content),"871ba530cf90a09cf0da383799960f443961ae18");assert.throws(()=>assertPackageLockBuffer(Buffer.from("{}")),/package-lock\.json changed/);});
  it("matches compiled Proof and executable Gateway code to the historical bundle",function(){const hashes=assertArtifactHashes(new URL("..",import.meta.url).pathname);assert.match(hashes.proofRuntime,/^0x[0-9a-f]{64}$/);assert.equal(hashes.gatewayExecutable,hashes.reviewedGatewayExecutable);assert.equal(hashes.gatewayMetadataDrift,true);});
  it("covers every Proof Gateway browser script",function(){for(const page of ["proof-verifier-deploy","proof-gateway-deploy","proof-gateway-final-state","proof-gateway-readiness","proof-gateway-execution","proof-gateway-workflow","proof-gateway-evidence-export","proof-gateway-evidence-import"])assert(PAGE_SCRIPTS.some(file=>file.includes(page)),page);assert.equal(new Set(PAGE_SCRIPTS).size,PAGE_SCRIPTS.length);});
  it("includes contract source, adversarial EVM and all workflow tests",function(){for(const test of ["gateway-source","adversarial-mock","gateway-evm","adversarial-evm","gateway-preparation","execution-final","workflow","evidence-export","evidence-import"])assert(GATE_TESTS.some(file=>file.includes(test)),test);assert.equal(new Set(GATE_TESTS).size,GATE_TESTS.length);});
  it("contains no deployment or wallet-send command",function(){const source=fs.readFileSync(new URL("../scripts/run-router2-proof-gateway-gate.mjs",import.meta.url),"utf8");assert.doesNotMatch(source,/eth_sendTransaction|DEPLOYER_PRIVATE_KEY|eth_sendRawTransaction/);assert.match(source,/Local compile and tests only/);});
});
