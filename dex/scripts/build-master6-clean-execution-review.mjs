import { ethers } from "ethers";
import { canonicalDigest } from "./build-intent-reproducibility-seal.mjs";

function verifyPacket(packet){
  const {packetDigest,...body}=packet||{};
  if(packet?.recordType!=="LQC_MASTER6_CLEAN_TESTNET_DEPLOYMENT_PACKET") throw new Error("Invalid clean packet");
  if(packet?.status!=="REVIEW_REQUIRED"||packet?.network?.chainId!==97) throw new Error("Invalid clean packet state");
  if(packet?.activationAuthorized!==false||packet?.transactionOccurred!==false) throw new Error("Clean packet must remain unsigned");
  if(canonicalDigest(body)!==packetDigest) throw new Error("Clean packet digest mismatch");
}
function verifyPreflight(packet,preflight){
  const {preflightDigest,...body}=preflight||{};
  if(preflight?.recordType!=="LQC_MASTER6_CLEAN_TESTNET_PREFLIGHT") throw new Error("Invalid clean preflight");
  if(preflight?.status!=="PREFLIGHT_VERIFIED_FOR_REVIEW"||preflight?.network?.chainId!==97) throw new Error("Invalid clean preflight state");
  if(preflight?.packetDigest!==packet.packetDigest||preflight?.sourceCommit!==packet.sourceCommit) throw new Error("Packet/preflight binding mismatch");
  if(preflight?.deployer?.toLowerCase()!==packet.deployer.toLowerCase()) throw new Error("Deployer mismatch");
  if(preflight?.deployerNonce!==packet.startingNonce) throw new Error("Deployer nonce mismatch");
  if(preflight?.activationAuthorized!==false||preflight?.transactionOccurred!==false) throw new Error("Preflight must remain non-activating");
  if(canonicalDigest(body)!==preflightDigest) throw new Error("Clean preflight digest mismatch");
}
export function buildMaster6CleanExecutionReview({packet,preflight}){
  verifyPacket(packet);verifyPreflight(packet,preflight);
  if(packet.deployments.length!==preflight.deployments.length) throw new Error("Deployment count mismatch");

  const byOrder=new Map(preflight.deployments.map(x=>[x.order,x]));
  const deployments=packet.deployments.map(item=>{
    const p=byOrder.get(item.order);
    if(!p||p.contract!==item.contract||p.predictedAddress.toLowerCase()!==item.predictedAddress.toLowerCase()||p.initCodeDigest!==item.initCodeDigest) throw new Error("Deployment/preflight mismatch");
    if(BigInt(p.approvedGasLimit)<=0n) throw new Error("Invalid approved gas limit");
    return {
      order:item.order,
      actor:"deployer",
      nonce:item.deployerNonce,
      contract:item.contract,
      predictedAddress:ethers.getAddress(item.predictedAddress),
      to:null,
      value:"0",
      data:item.data,
      initCodeDigest:item.initCodeDigest,
      approvedGasLimit:p.approvedGasLimit
    };
  });

  const governanceActions=packet.configurationActions.map(action=>({
    ...action,
    target:ethers.getAddress(action.target),
    value:"0"
  }));

  const body={
    schemaVersion:1,
    recordType:"LQC_MASTER6_CLEAN_EXECUTION_REVIEW",
    status:"AWAITING_EXPLICIT_EXECUTION_APPROVAL",
    network:{name:"BSC Testnet",chainId:97},
    sourceCommit:packet.sourceCommit,
    packetDigest:packet.packetDigest,
    preflightDigest:preflight.preflightDigest,
    deployer:ethers.getAddress(packet.deployer),
    deployerStartingNonce:packet.startingNonce,
    deployments,
    governanceActions,
    marketEnabled:false,
    activationAuthorized:false,
    transactionOccurred:false,
    approvalScope:"Exactly the listed 10 zero-value CREATE transactions in nonce order, followed only after receipt verification by the listed governance configuration actions. Any nonce, address, init code, gas limit, binding, source commit or RPC-state change requires a new review.",
    safety:"Human review artifact only. No wallet, key, signature, Safe proposal, deployment, configuration, token movement or transaction."
  };
  return {...body,reviewDigest:canonicalDigest(body)};
}
