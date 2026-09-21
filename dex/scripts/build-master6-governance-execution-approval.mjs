import fs from "node:fs";
import { canonicalDigest } from "./build-intent-reproducibility-seal.mjs";
import { verifyMaster6GovernanceProposalFreeze } from "./verify-master6-governance-configuration-proposal.mjs";

export const GOVERNANCE_APPROVAL_PHRASE="APPROVE_6_12_GOVERNANCE_CONFIGURATION";

function validateProposal(proposal){
  const {proposalPacketDigest,...body}=proposal||{};
  if(proposal?.recordType!=="LQC_MASTER6_GOVERNANCE_CONFIGURATION_PROPOSAL_PACKET") throw Error("Invalid Governance proposal packet");
  if(proposal?.status!=="AWAITING_EXPLICIT_GOVERNANCE_CONFIGURATION_APPROVAL") throw Error("Governance proposal status mismatch");
  if(proposal?.network?.chainId!==97) throw Error("Governance proposal must target BSC Testnet chain 97");
  if(proposal?.governanceThreshold!==4||proposal?.governanceOwnerCount!==7) throw Error("Governance Safe boundary must remain 4/7");
  if(proposal?.actions?.length!==7) throw Error("Governance proposal must contain seven actions");
  if(proposal?.marketEnabled!==false||proposal?.governanceConfigurationAuthorized!==false||proposal?.activationAuthorized!==false||proposal?.transactionOccurred!==false) throw Error("Governance proposal authorization boundary mismatch");
  if(canonicalDigest(body)!==proposalPacketDigest) throw Error("Governance proposal digest mismatch");
}

export function buildMaster6GovernanceExecutionApproval({proposal,approvalPhrase,revalidatedAt}){
  validateProposal(proposal);
  if(approvalPhrase!==GOVERNANCE_APPROVAL_PHRASE) throw Error("Explicit 6/12 Governance configuration approval phrase missing");
  if(!revalidatedAt||typeof revalidatedAt!=="string") throw Error("Fresh proposal revalidation evidence required");
  const body={
    schemaVersion:1,
    recordType:"LQC_MASTER6_GOVERNANCE_CONFIGURATION_EXECUTION_APPROVAL",
    status:"APPROVED_FOR_GOVERNANCE_SIGNATURE_COLLECTION_ONLY",
    network:proposal.network,
    proposalPacketDigest:proposal.proposalPacketDigest,
    governanceSafe:proposal.governanceSafe,
    governanceThreshold:proposal.governanceThreshold,
    governanceOwnerCount:proposal.governanceOwnerCount,
    startingSafeNonce:proposal.startingSafeNonce,
    actions:proposal.actions,
    approvalPhrase:GOVERNANCE_APPROVAL_PHRASE,
    revalidatedAt,
    approvalScope:"Exactly seven frozen Governance Safe configuration actions only. This approval permits signature collection for these exact SafeTxHashes after a fresh stale-state revalidation. It does not authorize market activation, arbitrary Safe transactions, token movement, or any changed calldata/nonce/target.",
    governanceConfigurationAuthorized:true,
    signatureCollectionAuthorized:true,
    proposalSubmissionAuthorized:false,
    executionAuthorized:false,
    activationAuthorized:false,
    transactionOccurred:false,
    safety:"Authorization artifact only. No wallet request, signature, Safe service submission, execTransaction, token movement or market activation is performed by this builder."
  };
  return {...body,approvalDigest:canonicalDigest(body)};
}

async function main(){
  const proposal=JSON.parse(fs.readFileSync(new URL("../deployments/master6-governance-configuration-proposal-bsc-testnet-97.json",import.meta.url),"utf8"));
  const phrase=process.env.MASTER6_GOVERNANCE_EXECUTION_APPROVAL;
  if(!phrase) throw Error("Set MASTER6_GOVERNANCE_EXECUTION_APPROVAL only after separate explicit human approval");
  await verifyMaster6GovernanceProposalFreeze();
  const out=buildMaster6GovernanceExecutionApproval({proposal,approvalPhrase:phrase,revalidatedAt:new Date().toISOString()});
  console.log("MASTER6_GOVERNANCE_EXECUTION_APPROVAL_BEGIN");
  console.log(JSON.stringify(out,null,2));
  console.log("MASTER6_GOVERNANCE_EXECUTION_APPROVAL_END");
}
if(import.meta.url===new URL("file://"+process.argv[1]).href) await main();
