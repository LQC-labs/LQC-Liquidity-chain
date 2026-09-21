import fs from "node:fs";
import { ethers } from "ethers";
import { buildMaster6CleanDeploymentPacket } from "./prepare-master6-clean-lending-deployment.mjs";
import { preflightMaster6CleanLending } from "./preflight-master6-clean-lending.mjs";
import { canonicalDigest } from "./build-intent-reproducibility-seal.mjs";

const RPCS=[
  "https://bsc-testnet-rpc.publicnode.com",
  "https://data-seed-prebsc-1-s1.bnbchain.org:8545"
];
const DEPLOYER="0x7cf23bB16Ed0E1eaF58CD31c9F5a643be438C6aB";
const SOURCE_COMMIT="0xc48e0bfa12df5c93a1320f520b7b356ca8471cfa";

async function main(){
  const providers=RPCS.map(url=>new ethers.JsonRpcProvider(url));
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
    packet,
    preflight,
    executionAuthorized:true,
    activationAuthorized:false,
    transactionOccurred:false,
    approvalBasis:"EXPLICIT_HUMAN_APPROVAL_RECORDED",
    executionBoundary:"Wallet must independently confirm each exact reviewed CREATE. Governance configuration remains separate and market stays disabled.",
    generatedAt:new Date().toISOString()
  };
  const out={...body,executionPacketDigest:canonicalDigest(body)};
  console.log("MASTER6_LIVE_EXECUTION_PACKET_BEGIN");
  console.log(JSON.stringify(out,null,2));
  console.log("MASTER6_LIVE_EXECUTION_PACKET_END");
}
await main();
