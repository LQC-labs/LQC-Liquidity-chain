import fs from "node:fs";
import { ethers } from "ethers";
import { canonicalDigest } from "./build-intent-reproducibility-seal.mjs";
import { verifyMaster6PostDeployment } from "./verify-master6-clean-post-deployment.mjs";

const RPCS=[
  "https://bsc-testnet-rpc.publicnode.com",
  "https://data-seed-prebsc-1-s1.bnbchain.org:8545"
];
const SAFE_ABI=[
  "function getOwners() view returns(address[])",
  "function getThreshold() view returns(uint256)",
  "function nonce() view returns(uint256)",
  "function getTransactionHash(address to,uint256 value,bytes data,uint8 operation,uint256 safeTxGas,uint256 baseGas,uint256 gasPrice,address gasToken,address refundReceiver,uint256 _nonce) view returns(bytes32)"
];
const ZERO=ethers.ZeroAddress;
const readJson=file=>JSON.parse(fs.readFileSync(new URL(file,import.meta.url),"utf8"));
const norm=v=>ethers.getAddress(v).toLowerCase();

function validateFrozenInputs(live,verification){
  if(live?.recordType!=="LQC_MASTER6_LIVE_EXECUTION_PACKET"||live?.status!=="APPROVED_FOR_WALLET_CONFIRMATION") throw Error("Invalid live execution packet");
  if(verification?.recordType!=="LQC_MASTER6_CLEAN_POST_DEPLOYMENT_VERIFICATION"||verification?.status!=="VERIFIED_10_OF_10_CLEAN_DEPLOYMENT") throw Error("Invalid post-deployment verification");
  if(live.network?.chainId!==97||verification.network?.chainId!==97) throw Error("Expected BSC Testnet chain 97");
  if(live.executionPacketDigest!==verification.executionPacketDigest) throw Error("Execution packet digest mismatch");
  if(live.deployer.toLowerCase()!==verification.deployer.toLowerCase()) throw Error("Deployer mismatch");
  if(verification.governanceConfigurationAuthorized!==false||verification.activationAuthorized!==false) throw Error("Governance/activation boundary already changed");
  if(live.packet?.configurationActions?.length!==7) throw Error("Expected exactly seven governance configuration actions");
  if(live.packet?.market?.enabled!==false) throw Error("Market must remain disabled");
  const expectedTargets=new Set(live.packet.deployments.slice(4).map(x=>x.predictedAddress.toLowerCase()));
  for(const a of live.packet.configurationActions){
    if(!expectedTargets.has(a.target.toLowerCase())) throw Error("Configuration target is outside clean Lending deployment: "+a.action);
    if(!ethers.isHexString(a.data)||a.data.length<10) throw Error("Invalid configuration calldata");
  }
}

export function buildMaster6GovernanceProposalPacket({live,verification,safeState,safeTxHashes}){
  validateFrozenInputs(live,verification);
  const safe=ethers.getAddress(live.packet.roles.governanceSafe);
  if(norm(safeState.safe)!==norm(safe)) throw Error("Governance Safe mismatch");
  if(Number(safeState.threshold)!==4||safeState.owners?.length!==7) throw Error("Expected Governance Safe threshold 4/7");
  if(new Set(safeState.owners.map(x=>norm(x))).size!==7) throw Error("Governance Safe owners must be distinct");
  if(!Array.isArray(safeTxHashes)||safeTxHashes.length!==7||safeTxHashes.some(x=>!ethers.isHexString(x,32))) throw Error("Seven Safe transaction hashes are required");
  const startingSafeNonce=BigInt(safeState.nonce);
  const actions=live.packet.configurationActions.map((a,i)=>({
    order:i+1,
    safeNonce:String(startingSafeNonce+BigInt(i)),
    target:ethers.getAddress(a.target),
    value:"0",
    data:a.data,
    operation:0,
    safeTxGas:"0",
    baseGas:"0",
    gasPrice:"0",
    gasToken:ZERO,
    refundReceiver:ZERO,
    safeTxHash:safeTxHashes[i]
  }));
  const body={
    schemaVersion:1,
    recordType:"LQC_MASTER6_GOVERNANCE_CONFIGURATION_PROPOSAL_PACKET",
    status:"AWAITING_EXPLICIT_GOVERNANCE_CONFIGURATION_APPROVAL",
    network:{name:"BSC Testnet",chainId:97},
    deploymentSourceCommit:live.sourceCommit,
    executionPacketDigest:live.executionPacketDigest,
    postDeploymentVerificationDigest:verification.verificationDigest,
    governanceSafe:safe,
    governanceThreshold:4,
    governanceOwnerCount:7,
    startingSafeNonce:String(startingSafeNonce),
    actions,
    marketEnabled:false,
    governanceConfigurationAuthorized:false,
    activationAuthorized:false,
    transactionOccurred:false,
    approvalScope:"Exactly seven ordered Governance Safe configuration transactions only. Each uses value 0, CALL operation 0, the frozen calldata and sequential Safe nonces. Any Safe owner/threshold/nonce, target, calldata, deployed binding or RPC-state drift invalidates this packet.",
    safety:"Proposal-preparation only. No signature, Safe proposal submission, configuration transaction, token movement or market activation."
  };
  return {...body,proposalPacketDigest:canonicalDigest(body)};
}

async function safeSnapshot(provider,safe){
  const c=new ethers.Contract(safe,SAFE_ABI,provider);
  const [owners,threshold,nonce]=await Promise.all([c.getOwners(),c.getThreshold(),c.nonce()]);
  return{safe:ethers.getAddress(safe),owners:owners.map(ethers.getAddress),threshold:String(threshold),nonce:String(nonce)};
}
async function hashAction(provider,safe,action,nonce){
  const c=new ethers.Contract(safe,SAFE_ABI,provider);
  return c.getTransactionHash(action.target,0n,action.data,0,0n,0n,0n,ZERO,ZERO,nonce);
}
export async function prepareMaster6GovernanceProposalPacket({providers=RPCS.map(x=>new ethers.JsonRpcProvider(x))}={}){
  if(!Array.isArray(providers)||providers.length<2) throw Error("Use 2+ BSC Testnet RPC providers");
  const live=readJson("../deployments/master6-live-execution-packet-bsc-testnet-97.json");
  const evidence=readJson("../deployments/master6-clean-post-deployment-evidence-bsc-testnet-97.json");
  const frozenVerification=readJson("../deployments/master6-clean-post-deployment-verification-bsc-testnet-97.json");
  validateFrozenInputs(live,frozenVerification);

  // Re-run the live fail-closed post-deployment verifier before preparing any Safe proposal.
  await verifyMaster6PostDeployment({providers,live,evidence,minConfirmations:3});

  const safe=ethers.getAddress(live.packet.roles.governanceSafe);
  const snapshots=await Promise.all(providers.map(p=>safeSnapshot(p,safe)));
  const stable=JSON.stringify(snapshots[0]);
  if(snapshots.slice(1).some(x=>JSON.stringify(x)!==stable)) throw Error("Governance Safe multi-RPC state disagreement");
  const snap=snapshots[0];
  if(Number(snap.threshold)!==4||snap.owners.length!==7) throw Error("Governance Safe is not 4/7");

  const hashes=[];
  for(let i=0;i<7;i++){
    const a=live.packet.configurationActions[i],nonce=BigInt(snap.nonce)+BigInt(i);
    const observed=await Promise.all(providers.map(p=>hashAction(p,safe,a,nonce)));
    if(new Set(observed.map(x=>x.toLowerCase())).size!==1) throw Error("SafeTxHash multi-RPC disagreement #"+(i+1));
    hashes.push(observed[0]);
  }
  return buildMaster6GovernanceProposalPacket({live,verification:frozenVerification,safeState:snap,safeTxHashes:hashes});
}

async function main(){
  const out=await prepareMaster6GovernanceProposalPacket();
  console.log("MASTER6_GOVERNANCE_PROPOSAL_PACKET_BEGIN");
  console.log(JSON.stringify(out,null,2));
  console.log("MASTER6_GOVERNANCE_PROPOSAL_PACKET_END");
}
if(import.meta.url===new URL("file://"+process.argv[1]).href) await main();
