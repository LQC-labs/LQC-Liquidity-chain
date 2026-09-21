import fs from "node:fs";
import { canonicalDigest } from "./build-intent-reproducibility-seal.mjs";
import { prepareMaster6GovernanceProposalPacket } from "./prepare-master6-governance-configuration.mjs";

const read=file=>JSON.parse(fs.readFileSync(new URL(file,import.meta.url),"utf8"));

function validateFrozenPacket(packet){
  const {proposalPacketDigest,...body}=packet||{};
  if(packet?.recordType!=="LQC_MASTER6_GOVERNANCE_CONFIGURATION_PROPOSAL_PACKET") throw Error("Invalid frozen proposal packet type");
  if(packet?.status!=="AWAITING_EXPLICIT_GOVERNANCE_CONFIGURATION_APPROVAL") throw Error("Frozen proposal packet status mismatch");
  if(packet?.network?.chainId!==97) throw Error("Frozen proposal packet must target BSC Testnet chain 97");
  if(packet?.governanceThreshold!==4||packet?.governanceOwnerCount!==7) throw Error("Frozen Governance Safe boundary must remain 4/7");
  if(packet?.actions?.length!==7) throw Error("Frozen proposal packet must contain seven actions");
  if(packet?.marketEnabled!==false||packet?.governanceConfigurationAuthorized!==false||packet?.activationAuthorized!==false||packet?.transactionOccurred!==false) throw Error("Frozen proposal packet authorization boundary mismatch");
  if(canonicalDigest(body)!==proposalPacketDigest) throw Error("Frozen proposal packet digest mismatch");
  const start=BigInt(packet.startingSafeNonce);
  for(let i=0;i<7;i++){
    const a=packet.actions[i];
    if(a.order!==i+1||BigInt(a.safeNonce)!==start+BigInt(i)) throw Error("Frozen Safe nonce sequence mismatch #"+(i+1));
    if(a.value!=="0"||a.operation!==0||a.safeTxGas!=="0"||a.baseGas!=="0"||a.gasPrice!=="0") throw Error("Frozen Safe transaction envelope mismatch #"+(i+1));
    if(!/^0x[0-9a-fA-F]{64}$/.test(a.safeTxHash||"")) throw Error("Frozen SafeTxHash malformed #"+(i+1));
  }
}

export async function verifyMaster6GovernanceProposalFreeze(){
  const frozen=read("../deployments/master6-governance-configuration-proposal-bsc-testnet-97.json");
  validateFrozenPacket(frozen);

  // This is deliberately read-only. The live builder re-runs the 10/10
  // post-deployment verification and checks the Governance Safe on 2 RPCs.
  const live=await prepareMaster6GovernanceProposalPacket();
  if(live.proposalPacketDigest!==frozen.proposalPacketDigest) throw Error("Governance proposal stale-state drift detected");
  if(JSON.stringify(live)!==JSON.stringify(frozen)) throw Error("Governance proposal live/frozen packet mismatch");

  return {
    status:"FROZEN_PROPOSAL_REVALIDATED",
    network:{name:"BSC Testnet",chainId:97},
    proposalPacketDigest:frozen.proposalPacketDigest,
    governanceSafe:frozen.governanceSafe,
    startingSafeNonce:frozen.startingSafeNonce,
    actionCount:frozen.actions.length,
    marketEnabled:false,
    governanceConfigurationAuthorized:false,
    activationAuthorized:false,
    transactionOccurred:false
  };
}

async function main(){
  const out=await verifyMaster6GovernanceProposalFreeze();
  console.log("MASTER6_GOVERNANCE_PROPOSAL_FREEZE_PASS");
  console.log(JSON.stringify(out,null,2));
}
if(import.meta.url===new URL("file://"+process.argv[1]).href) await main();
