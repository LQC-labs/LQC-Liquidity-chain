import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ethers } from "ethers";
import { canonicalDigest,sha256 } from "./build-intent-reproducibility-seal.mjs";
import { validateLendingTestnetConfig } from "./validate-lending-testnet-config.mjs";

const artifact=(name,source)=>JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname,`../artifacts/contracts/${source}.sol/${name}.json`),"utf8"));
const deploy=async(name,source,args)=>(await new ethers.ContractFactory(artifact(name,source).abi,artifact(name,source).bytecode).getDeployTransaction(...args)).data;
export async function buildLendingStage1Manifest(config){
  const preflight=validateLendingTestnetConfig(config),owner=preflight.roles.governanceSafe,guardian=preflight.roles.guardianSafe,actions=[
    {id:1,actor:"deployer",action:"deploy-lending-oracle-manager",contract:"LQCOracleManager",to:null,value:"0",data:await deploy("LQCOracleManager","lending/LQCOracleManager",[owner,guardian])},
    {id:2,actor:"deployer",action:"deploy-lending-interest-rate-model",contract:"LQCInterestRateModel",to:null,value:"0",data:await deploy("LQCInterestRateModel","lending/LQCInterestRateModel",[owner,guardian])}
  ],body={schemaVersion:1,manifestType:"LQC_LENDING_STAGE1_DEPLOYMENT",status:"REVIEW_REQUIRED",network:{name:"BSC Testnet",chainId:97},stage:"stage1-oracle-rate-deploy",configPreflightDigest:preflight.preflightDigest,roles:preflight.roles,marketId:preflight.market.marketId,orderedActions:actions.map(action=>({...action,initCodeDigest:sha256(action.data),initCodeBytes:(action.data.length-2)/2})),nextStage:"Deploy Market Registry and Interest Index only after independent Stage-1 receipt and runtime verification.",transactionOccurred:false,safety:"Unsigned deployment manifest only. No RPC, wallet, key, signature, approval, deployment, token movement, or transaction."};return{...body,manifestDigest:canonicalDigest(body)};
}
export function validateLendingStage1Manifest(manifest,config){const preflight=validateLendingTestnetConfig(config),{manifestDigest,...body}=manifest;if(manifest?.status!=="REVIEW_REQUIRED"||manifest.network?.chainId!==97||manifest.stage!=="stage1-oracle-rate-deploy"||manifest.transactionOccurred!==false||manifest.configPreflightDigest!==preflight.preflightDigest||canonicalDigest(body)!==manifestDigest||manifest.orderedActions?.length!==2||manifest.orderedActions.some((action,index)=>action.id!==index+1||action.actor!=="deployer"||action.to!==null||action.value!=="0"||!ethers.isHexString(action.data)||action.initCodeDigest!==sha256(action.data)))throw new Error("Invalid Lending Stage-1 deployment manifest");return true}
async function main(){const[configFile,outputFile]=process.argv.slice(2);if(!configFile)throw new Error("Usage: node prepare-lending-stage1-manifest.mjs <config-or-finalized-config.json> [manifest.json]");const input=JSON.parse(fs.readFileSync(path.resolve(configFile),"utf8")),config=input.recordType==="LQC_LENDING_STAGE0_FINALIZED_CONFIG"?input.config:input,result=await buildLendingStage1Manifest(config);if(outputFile)fs.writeFileSync(path.resolve(outputFile),`${JSON.stringify(result,null,2)}\n`,{flag:"wx"});else console.log(JSON.stringify(result,null,2))}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await main();
