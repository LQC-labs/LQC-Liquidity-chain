import { canonicalDigest } from "./build-intent-reproducibility-seal.mjs";

function verifyReview(review){
  const {reviewDigest,...body}=review||{};
  if(review?.recordType!=="LQC_MASTER6_CLEAN_EXECUTION_REVIEW") throw new Error("Invalid Master 6 clean execution review");
  if(review?.status!=="AWAITING_EXPLICIT_EXECUTION_APPROVAL") throw new Error("Execution review is not awaiting approval");
  if(review?.network?.chainId!==97) throw new Error("Execution approval must target BSC Testnet chain 97");
  if(review?.marketEnabled!==false||review?.activationAuthorized!==false||review?.transactionOccurred!==false) throw new Error("Execution review must remain non-activating");
  if(!Array.isArray(review.deployments)||review.deployments.length!==10) throw new Error("Execution review must contain 10 deployments");
  if(!Array.isArray(review.governanceActions)||review.governanceActions.length!==7) throw new Error("Execution review must contain 7 governance actions");
  if(canonicalDigest(body)!==reviewDigest) throw new Error("Execution review digest mismatch");
}

export function buildMaster6CleanExecutionApproval({review}){
  verifyReview(review);

  const body={
    schemaVersion:1,
    recordType:"LQC_MASTER6_CLEAN_EXECUTION_APPROVAL",
    status:"AWAITING_EXPLICIT_HUMAN_APPROVAL",
    network:review.network,
    sourceCommit:review.sourceCommit,
    packetDigest:review.packetDigest,
    preflightDigest:review.preflightDigest,
    reviewDigest:review.reviewDigest,
    deployer:review.deployer,
    deployerStartingNonce:review.deployerStartingNonce,
    deployments:review.deployments,
    governanceActions:review.governanceActions,
    marketEnabled:false,
    executionAuthorized:false,
    activationAuthorized:false,
    transactionOccurred:false,
    approvalScope:"Exactly the reviewed 10 zero-value CREATE transactions in nonce order. After independent receipt/runtime verification, only the reviewed 7 governance configuration actions may be prepared. Any nonce, address, source commit, init code, gas limit, Safe identity, calldata, dependency binding or RPC-state drift voids this approval packet.",
    approvalInstruction:"A separate explicit human approval is required before any signing or broadcast. The keyword used for ongoing development does not constitute transaction approval.",
    safety:"Approval packet only. No wallet, key, signature, Safe proposal, deployment, configuration, token movement or transaction."
  };
  return {...body,approvalDigest:canonicalDigest(body)};
}
