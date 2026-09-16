import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ethers } from "ethers";
import { canonicalDigest,sha256 } from "./build-intent-reproducibility-seal.mjs";
import { validateLendingTestnetConfig } from "./validate-lending-testnet-config.mjs";

const artifact=(name,source)=>JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname,`../artifacts/contracts/${source}.sol/${name}.json`),"utf8"));
const deploy=async(name,source,args)=>(await new ethers.ContractFactory(artifact(name,source).abi,artifact(name,source).bytecode).getDeployTransaction(...args)).data;

export async function buildLendingStage3Manifest({config,stage2Manifest,stage2Verification}){
  const approved=validateLendingTestnetConfig(config),{manifestDigest,...manifestBody}=stage2Manifest,{verificationDigest,...verificationBody}=stage2Verification;
  if(stage2Manifest?.status!=="REVIEW_REQUIRED"||stage2Manifest.stage!=="stage2-registry-index-deploy"||stage2Manifest.network?.chainId!==97||stage2Manifest.configPreflightDigest!==approved.preflightDigest||canonicalDigest(manifestBody)!==manifestDigest)throw new Error("Invalid Lending Stage-2 manifest");
  if(stage2Verification?.status!=="VERIFIED_LENDING_STAGE2_DEPLOYMENT"||stage2Verification.network?.chainId!==97||stage2Verification.transactionOccurred!==true||stage2Verification.manifestDigest!==manifestDigest||canonicalDigest(verificationBody)!==verificationDigest||stage2Verification.deployments?.length!==2)throw new Error("Invalid Lending Stage-2 verification");
  const byName=Object.fromEntries(stage2Verification.deployments.map(item=>[item.contract,item])),registry=byName.LQCLendingMarketRegistry,index=byName.LQCLendingInterestIndex;
  if(!ethers.isAddress(registry?.contractAddress)||!ethers.isAddress(index?.contractAddress)||registry.contractAddress.toLowerCase()===index.contractAddress.toLowerCase())throw new Error("Invalid Lending Stage-2 dependency addresses");
  if(registry.bindings?.owner?.toLowerCase()!==approved.roles.governanceSafe.toLowerCase()||registry.bindings?.guardian?.toLowerCase()!==approved.roles.guardianSafe.toLowerCase()||registry.bindings?.oracle?.toLowerCase()!==stage2Manifest.dependencies.oracleManager.toLowerCase()||index.bindings?.owner?.toLowerCase()!==approved.roles.governanceSafe.toLowerCase()||index.bindings?.rateModel?.toLowerCase()!==stage2Manifest.dependencies.interestRateModel.toLowerCase()||index.bindings?.core!==ethers.ZeroAddress)throw new Error("Untrusted Lending Stage-2 dependency bindings");
  const data=await deploy("LQCLendingCore","lending/LQCLendingCore",[approved.roles.governanceSafe,registry.contractAddress,index.contractAddress]),action={id:1,actor:"deployer",action:"deploy-lending-core",contract:"LQCLendingCore",to:null,value:"0",data,initCodeDigest:sha256(data),initCodeBytes:(data.length-2)/2},body={schemaVersion:1,manifestType:"LQC_LENDING_STAGE3_DEPLOYMENT",status:"REVIEW_REQUIRED",network:{name:"BSC Testnet",chainId:97},stage:"stage3-lending-core-deploy",configPreflightDigest:approved.preflightDigest,stage2ManifestDigest:manifestDigest,stage2VerificationDigest:verificationDigest,roles:approved.roles,dependencies:{marketRegistry:ethers.getAddress(registry.contractAddress),interestIndex:ethers.getAddress(index.contractAddress),oracleManager:ethers.getAddress(registry.bindings.oracle),interestRateModel:ethers.getAddress(index.bindings.rateModel)},orderedActions:[action],nextStage:"Bind the verified Interest Index to this Lending Core and deploy its Liquidation Engine only after independent Stage-3 verification and Safe review.",transactionOccurred:false,safety:"Unsigned Stage-3 deployment manifest only. No RPC, wallet, key, signature, approval, deployment, token movement, market activation, or transaction."};
  return{...body,manifestDigest:canonicalDigest(body)};
}

async function main(){const[c,m,v,o]=process.argv.slice(2);if(!c||!m||!v)throw new Error("Usage: node prepare-lending-stage3-manifest.mjs <config.json> <stage2-manifest.json> <stage2-verification.json> [output.json]");const read=f=>JSON.parse(fs.readFileSync(path.resolve(f),"utf8")),result=await buildLendingStage3Manifest({config:read(c),stage2Manifest:read(m),stage2Verification:read(v)});if(o)fs.writeFileSync(path.resolve(o),`${JSON.stringify(result,null,2)}\n`,{flag:"wx"});else console.log(JSON.stringify(result,null,2));}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await main();
