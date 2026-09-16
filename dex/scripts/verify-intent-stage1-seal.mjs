import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import solc from "solc";
import { buildIntentTestnetManifest } from "./prepare-intent-testnet-stack.mjs";
import { canonicalDigest,collectIntentArtifacts,collectIntentSources,sha256,verifyIntentReproducibilitySeal } from "./build-intent-reproducibility-seal.mjs";

const sorted=(values,key)=>[...values].sort((a,b)=>String(a[key]).localeCompare(String(b[key])));
export function verifyIntentStage1SealAgainstBuild({seal,readiness,sourceRevision,packageLockDigest,compilerVersion,sourceFiles,artifacts,stage1Actions}){
  if(!verifyIntentReproducibilitySeal(seal))throw new Error("Intent Stage-1 seal cryptographic verification failed");
  if(canonicalDigest(readiness)!==canonicalDigest(seal.stage1Readiness))throw new Error("Stage-1 readiness file does not match the seal");
  if(seal.sourceRevision!==sourceRevision||seal.runtime.packageLockDigest!==packageLockDigest||seal.compiler.version!==compilerVersion)throw new Error("Stage-1 build environment does not match the seal");
  const normalizedSources=sorted(sourceFiles,"path"),normalizedArtifacts=sorted(artifacts,"contract"),initCode=stage1Actions.map(value=>({action:value.action,initCodeDigest:sha256(value.data)}));
  if(canonicalDigest(normalizedSources)!==canonicalDigest(seal.sourceFiles)||canonicalDigest(normalizedArtifacts)!==canonicalDigest(seal.artifacts)||canonicalDigest(initCode)!==canonicalDigest(seal.stage1InitCode))throw new Error("Stage-1 source, artifact, or init code does not match the seal");
  return{status:"VERIFIED_FOR_STAGE1_DEPLOYMENT_REVIEW",network:{name:"BSC Testnet",chainId:97},sourceRevision,sealDigest:seal.sealDigest,readinessDigest:seal.stage1Readiness.readinessDigest,bondToken:seal.bondSelection.token,selectionContract:seal.bondSelectionVerification.selectionContract,stage1ContractCount:seal.artifacts.length,transactionOccurred:false,safety:"Local verification only. A verified seal does not authorize deployment or any Safe transaction."};
}

async function main(){
  const root=path.resolve(import.meta.dirname,".."),sealFile=process.env.INTENT_STAGE1_SEAL_FILE,readinessFile=process.env.INTENT_STAGE1_READINESS_FILE;if(!sealFile||!readinessFile)throw new Error("Set INTENT_STAGE1_SEAL_FILE and INTENT_STAGE1_READINESS_FILE");
  if(execFileSync("git",["status","--porcelain"],{cwd:root,encoding:"utf8"}).trim())throw new Error("Refusing to verify a dirty worktree");
  const seal=JSON.parse(fs.readFileSync(path.resolve(sealFile),"utf8")),readiness=JSON.parse(fs.readFileSync(path.resolve(readinessFile),"utf8")),manifest=await buildIntentTestnetManifest({bondToken:seal.bondSelection.token}),result=verifyIntentStage1SealAgainstBuild({seal,readiness,sourceRevision:execFileSync("git",["rev-parse","HEAD"],{cwd:root,encoding:"utf8"}).trim().toLowerCase(),packageLockDigest:sha256(fs.readFileSync(path.join(root,"package-lock.json"))),compilerVersion:solc.version(),sourceFiles:collectIntentSources(root),artifacts:collectIntentArtifacts(root),stage1Actions:manifest.orderedActions});
  console.log(JSON.stringify(result,null,2));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await main();
