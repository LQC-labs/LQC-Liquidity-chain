import test from "node:test";
import assert from "node:assert/strict";
import { canonicalDigest } from "../dex/scripts/build-intent-reproducibility-seal.mjs";
import { buildMaster6CleanExecutionApproval } from "../dex/scripts/build-master6-clean-execution-approval.mjs";

function review(){
  const body={
    schemaVersion:1,
    recordType:"LQC_MASTER6_CLEAN_EXECUTION_REVIEW",
    status:"AWAITING_EXPLICIT_EXECUTION_APPROVAL",
    network:{name:"BSC Testnet",chainId:97},
    sourceCommit:"0xf0866beaf914f3db8be46d5e60b5909db5dfc5f0",
    packetDigest:"sha256:packet",
    preflightDigest:"sha256:preflight",
    deployer:"0x7cf23bB16Ed0E1eaF58CD31c9F5a643be438C6aB",
    deployerStartingNonce:"200",
    deployments:Array.from({length:10},(_,i)=>({
      order:i+1,actor:"deployer",nonce:String(200+i),contract:"C"+(i+1),
      predictedAddress:"0x"+String(i+1).padStart(40,"0"),to:null,value:"0",data:"0x00",
      initCodeDigest:"sha256:"+String(i+1),approvedGasLimit:"1200000"
    })),
    governanceActions:Array.from({length:7},(_,i)=>({
      order:i+1,actor:"governanceSafe",target:"0x"+String(i+11).padStart(40,"0"),
      action:"action-"+(i+1),data:"0x00",value:"0"
    })),
    marketEnabled:false,
    activationAuthorized:false,
    transactionOccurred:false,
    approvalScope:"test",
    safety:"test"
  };
  return {...body,reviewDigest:canonicalDigest(body)};
}

test("Master 6/12 approval packet never treats development continuation as execution approval",()=>{
  const result=buildMaster6CleanExecutionApproval({review:review()});
  assert.equal(result.status,"AWAITING_EXPLICIT_HUMAN_APPROVAL");
  assert.equal(result.executionAuthorized,false);
  assert.equal(result.activationAuthorized,false);
  assert.equal(result.transactionOccurred,false);
  assert.equal(result.deployments.length,10);
  assert.equal(result.governanceActions.length,7);
  assert.match(result.approvalInstruction,/separate explicit human approval/i);
  assert.match(result.approvalInstruction,/does not constitute transaction approval/i);
});

test("Master 6/12 approval packet rejects activating or tampered review input",()=>{
  const base=review();
  const activating={...base,activationAuthorized:true};
  const {reviewDigest,...body}=activating;
  activating.reviewDigest=canonicalDigest(body);
  assert.throws(()=>buildMaster6CleanExecutionApproval({review:activating}),/non-activating/);

  const tampered=review();
  tampered.deployerStartingNonce="201";
  assert.throws(()=>buildMaster6CleanExecutionApproval({review:tampered}),/digest mismatch/);
});
