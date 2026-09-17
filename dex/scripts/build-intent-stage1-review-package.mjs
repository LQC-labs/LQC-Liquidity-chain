import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { canonicalDigest,sha256,verifyIntentReproducibilitySeal } from "./build-intent-reproducibility-seal.mjs";

export function buildIntentStage1ReviewPackage({seal,buildVerification,manifest}){
  if(!verifyIntentReproducibilitySeal(seal)||buildVerification?.status!=="VERIFIED_FOR_STAGE1_DEPLOYMENT_REVIEW"||buildVerification.transactionOccurred!==false||manifest?.network?.chainId!==97||manifest.stage!=="stage1-core-deploy"||manifest.dryRun?.transactionOccurred!==false||manifest.orderedActions?.length!==4)throw new Error("Invalid Stage-1 review inputs");
  if(buildVerification.sealDigest!==seal.sealDigest||buildVerification.sourceRevision!==seal.sourceRevision||buildVerification.readinessDigest!==seal.stage1Readiness.readinessDigest||buildVerification.bondToken?.toLowerCase()!==seal.bondSelection.token.toLowerCase()||manifest.dependencies?.bondToken?.toLowerCase()!==seal.bondSelection.token.toLowerCase())throw new Error("Stage-1 review binding mismatch");
  const actions=manifest.orderedActions.map(({id,actor,action,to,value,data})=>({id,actor,action,to,value,initCodeDigest:sha256(data),initCodeBytes:(data.length-2)/2}));
  if(canonicalDigest(actions.map(({action,initCodeDigest})=>({action,initCodeDigest})))!==canonicalDigest(seal.stage1InitCode))throw new Error("Stage-1 manifest init code does not match the seal");
  const body={schemaVersion:1,packageType:"LQC_INTENT_STAGE1_DEPLOYMENT_REVIEW",status:"REVIEW_REQUIRED",network:{name:"BSC Testnet",chainId:97},sourceRevision:seal.sourceRevision,sealDigest:seal.sealDigest,readinessDigest:seal.stage1Readiness.readinessDigest,bondToken:seal.bondSelection.token,selectionContract:seal.bondSelectionVerification.selectionContract,roles:manifest.roles,policy:manifest.policy,dependencies:manifest.dependencies,actions,reviewChecklist:["Confirm BSC Testnet chain ID 97.","Confirm the exact source revision and seal digest.","Confirm all four constructor targets and arguments from the decoded init code.","Confirm the deployer has only testnet tBNB and no production keys are exposed.","Obtain separate explicit deployment approval before submitting any transaction."],transactionOccurred:false,safety:"Review package only. It does not sign, deploy, approve, transfer tokens, or submit a transaction."};
  return{...body,reviewDigest:canonicalDigest(body)};
}

export function writeIntentStage1ReviewPackage(outputDirectory,review,inputs){
  fs.mkdirSync(outputDirectory,{recursive:true});if(fs.readdirSync(outputDirectory).length)throw new Error("Use an empty output directory to preserve immutable review evidence");
  for(const[name,value]of Object.entries({"review-manifest.json":review,"stage1-seal.json":inputs.seal,"build-verification.json":inputs.buildVerification,"stage1-deployment-manifest.json":inputs.manifest}))fs.writeFileSync(path.join(outputDirectory,name),`${JSON.stringify(value,null,2)}\n`);
  fs.writeFileSync(path.join(outputDirectory,"REVIEW.md"),`# LQC Intent Stage 1 Deployment Review\n\nReview digest: \`${review.reviewDigest}\`\n\n${review.reviewChecklist.map((item,index)=>`${index+1}. ${item}`).join("\n")}\n\n> ${review.safety}\n`);return{status:"REVIEW_PACKAGE_WRITTEN",reviewDigest:review.reviewDigest,fileCount:5,outputDirectory};
}

async function main(){const[sealFile,verificationFile,manifestFile,outputDirectory]=process.argv.slice(2);if(!outputDirectory)throw new Error("Usage: node build-intent-stage1-review-package.mjs <seal.json> <build-verification.json> <stage1-manifest.json> <empty-output-dir>");const read=file=>JSON.parse(fs.readFileSync(path.resolve(file),"utf8")),inputs={seal:read(sealFile),buildVerification:read(verificationFile),manifest:read(manifestFile)},review=buildIntentStage1ReviewPackage(inputs);console.log(JSON.stringify(writeIntentStage1ReviewPackage(path.resolve(outputDirectory),review,inputs),null,2));}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await main();
