import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { ethers } from "ethers";

export const REVIEWED_PACKAGE_LOCK_BLOB="2a2cdafdca61430ea5a7dc04cba186e363da9aaf";
export const PAGE_SCRIPTS=Object.freeze([
  "router2-proof-verifier-deploy-testnet.js","router2-proof-gateway-deploy-testnet.js",
  "router2-proof-gateway-final-state-testnet.js","router2-proof-gateway-readiness-testnet.js",
  "router2-proof-gateway-execution-testnet.js","router2-proof-gateway-execution-final-testnet.js",
  "router2-proof-gateway-workflow-testnet.js","router2-proof-gateway-evidence-export-testnet.js",
  "router2-proof-gateway-evidence-import-testnet.js",
  "router2-proof-gateway-monitor-testnet.js",
  "router2-proof-gateway-report-verify-testnet.js",
  "router2-proof-gateway-history-testnet.js",
  "router2-proof-gateway-history-receipt-verify-testnet.js",
]);
export const GATE_TESTS=Object.freeze([
  "test/router2-proof-bound-gateway-source.test.mjs","test/router2-proof-bound-gateway-adversarial-mock.test.mjs",
  "test/router2-proof-bound-gateway-evm.test.mjs","test/router2-proof-bound-gateway-adversarial-evm.test.mjs",
  "test/router2-proof-bound-gateway-preparation.test.mjs","test/router2-proof-verifier-deploy-page.test.mjs",
  "test/router2-proof-gateway-deploy-page.test.mjs","test/router2-proof-gateway-final-state-page.test.mjs",
  "test/router2-proof-gateway-readiness-page.test.mjs","test/router2-proof-gateway-execution-page.test.mjs",
  "test/router2-proof-gateway-execution-final-page.test.mjs","test/router2-proof-gateway-workflow-page.test.mjs",
  "test/router2-proof-gateway-evidence-export-page.test.mjs","test/router2-proof-gateway-evidence-import-page.test.mjs",
  "test/router2-proof-gateway-monitor-page.test.mjs",
  "test/router2-proof-gateway-report-verify-page.test.mjs",
  "test/router2-proof-gateway-history-page.test.mjs",
  "test/router2-proof-gateway-history-receipt-verify-page.test.mjs",
]);

export function gitBlobSha(content){return crypto.createHash("sha1").update(Buffer.from("blob "+content.length+"\0")).update(content).digest("hex");}
export function assertPackageLockBuffer(content){const actual=gitBlobSha(content);if(actual!==REVIEWED_PACKAGE_LOCK_BLOB)throw new Error("dex/package-lock.json changed: expected reviewed blob "+REVIEWED_PACKAGE_LOCK_BLOB+", received "+actual);return actual;}
// This pin authenticates the reviewed candidate record, not approval. Changing it
// or transitioning PENDING requires a separately reviewed source change.
export const DEVELOPMENT_RECORD_SHA256="09ea78611fe59ab46c33df937a88e591ac0d349ade4187d3c27cade049fe32c1";
export const HISTORICAL_PACKAGE_LOCK_SHA256="485ab89063da2ddc822e84c9a29ca0328c0f1b6a5f7bde8134669a32f3f0a71c";
const historicalLockPath="test/fixtures/router2-proof-gateway/historical-package-lock.json";
const developmentRecordPath="config/router2-proof-gateway-development-dependencies.json";
const sha256=content=>crypto.createHash("sha256").update(content).digest("hex");
function requireDependency(condition,message){if(!condition)throw new Error(message);}
export function assertHistoricalPackageLock(root){
  const content=fs.readFileSync(path.join(root,historicalLockPath));
  const blob=assertPackageLockBuffer(content);
  requireDependency(sha256(content)===HISTORICAL_PACKAGE_LOCK_SHA256,"Historical package lock SHA-256 mismatch");
  return {gitBlob:blob,sha256:HISTORICAL_PACKAGE_LOCK_SHA256};
}
// Integrity is distinct from authority. A matching PENDING record is never approval.
export function inspectDevelopmentDependencies(root){
  const recordFile=path.join(root,developmentRecordPath);
  requireDependency(fs.existsSync(recordFile),"Development dependency record missing");
  const bytes=fs.readFileSync(recordFile);
  requireDependency(sha256(bytes)===DEVELOPMENT_RECORD_SHA256,"Development dependency record changed; separate review required");
  const record=JSON.parse(bytes);
  requireDependency(record.schemaVersion===1 && record.baseCommit==="8db16368b3e09a94bfd500a17e33e3e9ef62ed51","Invalid development dependency record structure");
  requireDependency(record.approval?.authority && ["PENDING","APPROVED"].includes(record.approval.status),"Invalid development dependency approval record");
  const pkg=fs.readFileSync(path.join(root,"package.json"));
  const lock=fs.readFileSync(path.join(root,"package-lock.json"));
  requireDependency(sha256(pkg)===record.packageJsonSha256,"Development package.json SHA-256 mismatch");
  requireDependency(sha256(lock)===record.packageLockSha256 && gitBlobSha(lock)===record.packageLockGitBlob,"Development package-lock.json identity mismatch");
  const packages=JSON.parse(lock).packages;
  for(const [name,version] of Object.entries(record.packages)){
    requireDependency(packages?.["node_modules/"+name]?.version===version,"Development locked package version mismatch: "+name);
  }
  return {integrity:"pass",approvalStatus:record.approval.status,releaseReady:false,record};
}
export function assertDevelopmentDependenciesApproved(root){
  const state=inspectDevelopmentDependencies(root);
  requireDependency(state.approvalStatus==="APPROVED","Development dependency approval PENDING; release blocked");
  // Runtime identity is checked only when attempting an approved release gate.
  requireDependency(process.versions.node===state.record.toolchain.node,"Development Node version mismatch");
  const npmVersion=execFileSync("npm",["--version"],{cwd:root,encoding:"utf8"}).trim();
  requireDependency(npmVersion===state.record.toolchain.npm,"Development npm version mismatch");
  for(const [name,version] of Object.entries(state.record.packages)){
    const installed=JSON.parse(fs.readFileSync(path.join(root,"node_modules",name,"package.json"),"utf8"));
    requireDependency(installed.version===version,"Development installed package version mismatch: "+name);
  }
  return state;
}
export function inspectArtifactHashes(root){
  const read=relative=>JSON.parse(fs.readFileSync(path.join(root,relative),"utf8")),bundle=read("deployments/router2-proof-bound-gateway-stage1-bsc-testnet-97.json"),proof=read("artifacts/contracts/router-v2/LQCBestExecutionProof.sol/LQCBestExecutionProof.json"),gateway=read("artifacts/contracts/router-v2/LQCProofBoundExecutionGateway.sol/LQCProofBoundExecutionGateway.json");
  const candidate={proofCreation:ethers.keccak256(proof.bytecode),proofRuntime:ethers.keccak256(proof.deployedBytecode),gatewayCreation:ethers.keccak256(gateway.bytecode),gatewayRuntime:ethers.keccak256(gateway.deployedBytecode)};
  const deployed={proofCreation:bundle.bytecodeHashes.bestExecutionProof,proofRuntime:bundle.runtimeBytecodeHashes.bestExecutionProof,gatewayCreation:bundle.bytecodeHashes.proofBoundGateway,gatewayRuntime:bundle.runtimeBytecodeHashes.proofBoundGateway,gatewayTemplate:ethers.keccak256(bundle.gatewayTemplate.bytecode)};
  const drift=[];
  for(const key of ["proofCreation","proofRuntime","gatewayCreation","gatewayRuntime"])if(candidate[key]!==deployed[key])drift.push({key,deployed:deployed[key],candidate:candidate[key]});
  if(deployed.gatewayCreation!==deployed.gatewayTemplate)throw new Error(`Historical Proof Gateway deployment bundle is internally inconsistent: gatewayCreation=${deployed.gatewayCreation} gatewayTemplate=${deployed.gatewayTemplate}`);
  return{candidate,deployed,drift,redeployRequired:drift.length>0};
}
export function assertArtifactHashes(root){
  const state=inspectArtifactHashes(root);
  if(state.redeployRequired)throw new Error("Proof Gateway current candidate does not match historical deployed artifact; testnet redeployment/review required before release: "+state.drift.map(({key,deployed,candidate})=>`${key} deployed=${deployed} candidate=${candidate}`).join("; "));
  return state.candidate;
}
export function runProofGatewayGate(root=path.resolve(import.meta.dirname,"..")){
  const historicalDependencies=assertHistoricalPackageLock(root);
  const developmentDependencies=assertDevelopmentDependenciesApproved(root);
  execFileSync(process.execPath,["scripts/compile.mjs"],{cwd:root,stdio:"inherit"});
  const hashes=assertArtifactHashes(root);
  for(const page of PAGE_SCRIPTS)execFileSync(process.execPath,["--check",path.join("app",page)],{cwd:root,stdio:"inherit"});
  execFileSync(process.execPath,[path.join("node_modules","mocha","bin","mocha.js"),"--timeout","30000",...GATE_TESTS],{cwd:root,stdio:"inherit"});
  return{status:"pass",network:"BSC Testnet",chainId:97,packageLockBlob:developmentDependencies.record.packageLockGitBlob,historicalDependencies,developmentDependencies,soliditySources:51,pageScripts:PAGE_SCRIPTS.length,testFiles:GATE_TESTS.length,hashes,safety:"Local compile and tests only. No wallet, signature, transaction, approval, token movement, or swap."};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)console.log(JSON.stringify(runProofGatewayGate(),null,2));
