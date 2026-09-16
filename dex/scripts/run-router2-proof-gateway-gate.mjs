import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { ethers } from "ethers";

export const REVIEWED_PACKAGE_LOCK_BLOB="871ba530cf90a09cf0da383799960f443961ae18";
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
  assertPackageLockBuffer(fs.readFileSync(path.join(root,"package-lock.json")));
  execFileSync(process.execPath,["scripts/compile.mjs"],{cwd:root,stdio:"inherit"});
  const hashes=assertArtifactHashes(root);
  for(const page of PAGE_SCRIPTS)execFileSync(process.execPath,["--check",path.join("app",page)],{cwd:root,stdio:"inherit"});
  execFileSync(process.execPath,[path.join("node_modules","mocha","bin","mocha.js"),"--timeout","30000",...GATE_TESTS],{cwd:root,stdio:"inherit"});
  return{status:"pass",network:"BSC Testnet",chainId:97,packageLockBlob:REVIEWED_PACKAGE_LOCK_BLOB,soliditySources:51,pageScripts:PAGE_SCRIPTS.length,testFiles:GATE_TESTS.length,hashes,safety:"Local compile and tests only. No wallet, signature, transaction, approval, token movement, or swap."};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)console.log(JSON.stringify(runProofGatewayGate(),null,2));
