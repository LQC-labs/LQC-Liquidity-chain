import fs from "node:fs";
import { ethers } from "ethers";
import { buildMaster6CleanDeploymentPacket } from "./prepare-master6-clean-lending-deployment.mjs";
import { preflightMaster6CleanLending } from "./preflight-master6-clean-lending.mjs";
import { canonicalDigest } from "./build-intent-reproducibility-seal.mjs";

const RPCS=[
  "https://bsc-testnet-rpc.publicnode.com",
  "https://data-seed-prebsc-1-s1.bnbchain.org:8545"
];
const APPROVED_DEPLOYER="0xDe05e09DB1292aFf6ab62164134f1ad384Bca6FB";
const DEPLOYER_EVIDENCE="dex/deployments/bsc-testnet/futures-2026-09-19.md";

function requiredAddress(value,label){
  if(!value||!ethers.isAddress(value)||ethers.getAddress(value)===ethers.ZeroAddress) throw new Error(label+" must be a non-zero EVM address");
  return ethers.getAddress(value);
}
function requiredCommit(value){
  if(!value||!/^0x[0-9a-fA-F]{40}$/.test(value)) throw new Error("MASTER6_SOURCE_COMMIT must be a 20-byte hex commit pin");
  return value.toLowerCase();
}
function requireApproval(value){
  if(value!=="APPROVE_6_12_TESTNET_DEPLOYMENT") throw new Error("Explicit 6/12 execution approval phrase missing");
}
function requireApprovedDeployer(value){
  if(value.toLowerCase()!==APPROVED_DEPLOYER.toLowerCase()) throw new Error("MASTER6_DEPLOYER does not match the verified Futures BSC Testnet deployer");
}

export async function generateMaster6LiveExecutionPacket({
  deployer,
  sourceCommit,
  approvalPhrase,
  providers=RPCS.map(url=>new ethers.JsonRpcProvider(url))
}){
  const DEPLOYER=requiredAddress(deployer,"MASTER6_DEPLOYER");
  requireApprovedDeployer(DEPLOYER);
  const SOURCE_COMMIT=requiredCommit(sourceCommit);
  requireApproval(approvalPhrase);
  if(!Array.isArray(providers)||providers.length<2) throw new Error("Use 2+ BSC Testnet RPC providers");

  const networks=await Promise.all(providers.map(p=>p.getNetwork()));
  if(networks.some(n=>Number(n.chainId)!==97)) throw new Error("BSC Testnet chain mismatch");
  const nonces=await Promise.all(providers.map(p=>p.getTransactionCount(DEPLOYER,"pending")));
  if(new Set(nonces).size!==1) throw new Error("RPC pending nonce disagreement");

  const cfg=JSON.parse(fs.readFileSync(new URL("../deployments/lending-stage0-finalized-config-bsc-testnet-97.json",import.meta.url),"utf8")).config;
  const stage0=JSON.parse(fs.readFileSync(new URL("../deployments/lending-stage0-completion-bsc-testnet-97.json",import.meta.url),"utf8"));
  const packet=await buildMaster6CleanDeploymentPacket({
    config:cfg,
    stage0Completion:stage0,
    deployer:DEPLOYER,
    startingNonce:String(nonces[0]),
    sourceCommit:SOURCE_COMMIT
  });
  const preflight=await preflightMaster6CleanLending({providers,packet});
  const body={
    schemaVersion:1,
    recordType:"LQC_MASTER6_LIVE_EXECUTION_PACKET",
    status:"APPROVED_FOR_WALLET_CONFIRMATION",
    network:{name:"BSC Testnet",chainId:97},
    sourceCommit:SOURCE_COMMIT,
    deployer:DEPLOYER,
    deployerEvidence:DEPLOYER_EVIDENCE,
    packet,
    preflight,
    executionAuthorized:true,
    activationAuthorized:false,
    transactionOccurred:false,
    approvalBasis:"EXPLICIT_HUMAN_APPROVAL_RECORDED",
    executionBoundary:"Wallet must independently confirm each exact reviewed CREATE. Governance configuration remains separate and market stays disabled.",
    generatedAt:new Date().toISOString()
  };
  return {...body,executionPacketDigest:canonicalDigest(body)};
}

async function main(){
  const out=await generateMaster6LiveExecutionPacket({
    deployer:process.env.MASTER6_DEPLOYER,
    sourceCommit:process.env.MASTER6_SOURCE_COMMIT,
    approvalPhrase:process.env.MASTER6_EXECUTION_APPROVAL
  });
  console.log("MASTER6_LIVE_EXECUTION_PACKET_BEGIN");
  console.log(JSON.stringify(out,null,2));
  console.log("MASTER6_LIVE_EXECUTION_PACKET_END");
}

if(import.meta.url===new URL("file://"+process.argv[1]).href) await main();
