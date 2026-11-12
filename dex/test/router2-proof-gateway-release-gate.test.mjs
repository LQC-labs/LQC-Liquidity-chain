import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import {
  GATE_TESTS,PAGE_SCRIPTS,REVIEWED_PACKAGE_LOCK_BLOB,assertArtifactHashes,
  assertPackageLockBuffer,gitBlobSha,inspectArtifactHashes,
  assertHistoricalPackageLock,inspectDevelopmentDependencies,assertDevelopmentDependenciesApproved,runProofGatewayGate,
  HISTORICAL_PACKAGE_LOCK_SHA256,
} from "../scripts/run-router2-proof-gateway-gate.mjs";

describe("Router 2.0 Proof Gateway release safety gate",function(){
  const root=new URL("..",import.meta.url).pathname;
  const fixture="test/fixtures/router2-proof-gateway/historical-package-lock.json";
  const record="config/router2-proof-gateway-development-dependencies.json";
  function isolated(callback){
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),"router2-dependencies-"));
    try{
      for(const name of ["package.json","package-lock.json",fixture,record]){
        const target=path.join(dir,name);fs.mkdirSync(path.dirname(target),{recursive:true});
        fs.copyFileSync(path.join(root,name),target);
      }
      callback(dir);
    }finally{fs.rmSync(dir,{recursive:true,force:true});}
  }
  it("pins historical fixture Git blob and independent SHA-256",function(){
    const content=fs.readFileSync(path.join(root,fixture));
    assert.equal(gitBlobSha(content),REVIEWED_PACKAGE_LOCK_BLOB);
    assert.equal(assertPackageLockBuffer(content),"2a2cdafdca61430ea5a7dc04cba186e363da9aaf");
    assert.equal(crypto.createHash("sha256").update(content).digest("hex"),HISTORICAL_PACKAGE_LOCK_SHA256);
    assert.equal(assertHistoricalPackageLock(root).gitBlob,REVIEWED_PACKAGE_LOCK_BLOB);
  });
  it("rejects a one-byte historical fixture mutation",function(){isolated(dir=>{
    const file=path.join(dir,fixture),bytes=fs.readFileSync(file);bytes[0]^=1;fs.writeFileSync(file,bytes);
    assert.throws(()=>assertHistoricalPackageLock(dir),/package-lock\.json changed/);
  });});
  it("validates current package and lock identities without granting approval",function(){
    const state=inspectDevelopmentDependencies(root);
    assert.equal(state.integrity,"pass");assert.equal(state.approvalStatus,"PENDING");assert.equal(state.releaseReady,false);
    assert.throws(()=>assertDevelopmentDependenciesApproved(root),/approval PENDING/);
  });
  it("blocks the release gate before compilation while approval is pending",function(){isolated(dir=>{
    assert.throws(()=>runProofGatewayGate(dir),/approval PENDING/);
    assert.equal(fs.existsSync(path.join(dir,"artifacts")),false);
  });});
  it("rejects a missing development approval record",function(){isolated(dir=>{
    fs.unlinkSync(path.join(dir,record));assert.throws(()=>inspectDevelopmentDependencies(dir),/record missing/);
  });});
  it("rejects record tampering and self-declared approval",function(){isolated(dir=>{
    const file=path.join(dir,record),m=JSON.parse(fs.readFileSync(file));m.approval.status="APPROVED";
    fs.writeFileSync(file,JSON.stringify(m));assert.throws(()=>inspectDevelopmentDependencies(dir),/record changed/);
  });});
  for(const file of ["package.json","package-lock.json"]){
    it(`rejects current ${file} mutation`,function(){isolated(dir=>{
      fs.appendFileSync(path.join(dir,file)," ");assert.throws(()=>inspectDevelopmentDependencies(dir),/mismatch/);
    });});
  }
  it("rejects substituting the current lock for historical evidence",function(){isolated(dir=>{
    fs.copyFileSync(path.join(dir,"package-lock.json"),path.join(dir,fixture));
    assert.throws(()=>assertHistoricalPackageLock(dir),/package-lock\.json changed/);
  });});
  it("rejects substituting historical evidence for current dependencies",function(){isolated(dir=>{
    fs.copyFileSync(path.join(dir,fixture),path.join(dir,"package-lock.json"));
    assert.throws(()=>inspectDevelopmentDependencies(dir),/identity mismatch/);
  });});
  it("separates current candidate hashes from historical deployed evidence",function(){const state=inspectArtifactHashes(new URL("..",import.meta.url).pathname);for(const hash of Object.values(state.candidate))assert.match(hash,/^0x[0-9a-f]{64}$/);for(const hash of Object.values(state.deployed))assert.match(hash,/^0x[0-9a-f]{64}$/);assert.equal(state.deployed.gatewayCreation,state.deployed.gatewayTemplate);assert.equal(state.redeployRequired,state.drift.length>0);for(const item of state.drift){assert.notEqual(item.deployed,item.candidate);assert.ok(["proofCreation","proofRuntime","gatewayCreation","gatewayRuntime"].includes(item.key));}});
  it("keeps the release assertion blocking while a redeployment is required",function(){const root=new URL("..",import.meta.url).pathname;const state=inspectArtifactHashes(root);if(state.redeployRequired){assert.throws(()=>assertArtifactHashes(root),/testnet redeployment\/review required before release/);}else{const hashes=assertArtifactHashes(root);assert.deepEqual(hashes,state.candidate);}});
  it("covers every Proof Gateway browser script",function(){for(const page of ["proof-verifier-deploy","proof-gateway-deploy","proof-gateway-final-state","proof-gateway-readiness","proof-gateway-execution","proof-gateway-workflow","proof-gateway-evidence-export","proof-gateway-evidence-import"])assert(PAGE_SCRIPTS.some(file=>file.includes(page)),page);assert.equal(new Set(PAGE_SCRIPTS).size,PAGE_SCRIPTS.length);});
  it("includes contract source, adversarial EVM and all workflow tests",function(){for(const test of ["gateway-source","adversarial-mock","gateway-evm","adversarial-evm","gateway-preparation","execution-final","workflow","evidence-export","evidence-import"])assert(GATE_TESTS.some(file=>file.includes(test)),test);assert.equal(new Set(GATE_TESTS).size,GATE_TESTS.length);});
  it("contains no deployment or wallet-send command",function(){const source=fs.readFileSync(new URL("../scripts/run-router2-proof-gateway-gate.mjs",import.meta.url),"utf8");assert.doesNotMatch(source,/eth_sendTransaction|DEPLOYER_PRIVATE_KEY|eth_sendRawTransaction/);assert.match(source,/Local compile and tests only/);});
});
