import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ethers } from "ethers";
import { canonicalDigest } from "../scripts/build-intent-reproducibility-seal.mjs";
import { buildBondSelectionEvidence,writeBondSelectionEvidence } from "../scripts/build-intent-bond-selection-evidence.mjs";

describe("LQC Intent Bond selection Stage-0 evidence",function(){
  const safe="0x5235e26EE4D511aE8ba1FB1cff2619Fc1D90C02A",token="0x0000000000000000000000000000000000000030",selection="0x0000000000000000000000000000000000000020",txHash=ethers.id("safe-tx"),blockHash=ethers.id("block"),inspection={results:[{token,decimals:18,network:{chainId:97},assessment:{eligible:true}}]};
  const inputs=()=>{const digest=canonicalDigest(inspection);return{inspection,deployPlan:{stage:"stage0-selection-recorder-deploy",network:{chainId:97},governanceSafe:safe,bondToken:token,inspectionDigest:digest,transactionOccurred:false},approvalPlan:{stage:"stage0-governance-bond-approval",network:{chainId:97},governanceSafe:safe,bondToken:token,inspectionDigest:digest,selectionContract:selection,safeTransaction:{nonce:"7"},safeTransactionHash:txHash,transactionOccurred:false},preflight:{status:"PREFLIGHT_VERIFIED",chainId:97,governanceSafe:safe,bondToken:token,inspectionDigest:digest,selectionContract:selection,safeNonce:"7",safeTransactionHash:txHash,blockNumber:200,blockHash,rpcCount:2,transactionOccurred:false}};};
  it("binds every Stage-0 artifact into a deterministic read-only bundle",function(){const bundle=buildBondSelectionEvidence(inputs());assert.equal(bundle.network.chainId,97);assert.equal(bundle.rpcCount,2);assert.match(bundle.bundleDigest,/^sha256:[0-9a-f]{64}$/);assert.match(bundle.safety,/does not sign, deploy/i);assert.equal(bundle.bundleDigest,buildBondSelectionEvidence(inputs()).bundleDigest);});
  it("rejects substituted token, stale nonce and weak RPC evidence",function(){let value=inputs();value.preflight.bondToken="0x0000000000000000000000000000000000000040";assert.throws(()=>buildBondSelectionEvidence(value),/token changed/);value=inputs();value.preflight.safeNonce="8";assert.throws(()=>buildBondSelectionEvidence(value),/not bound/);value=inputs();value.preflight.rpcCount=1;assert.throws(()=>buildBondSelectionEvidence(value),/multi-RPC/);});
  it("writes an immutable six-file evidence directory",function(){const directory=fs.mkdtempSync(path.join(os.tmpdir(),"lqc-intent-bond-")),value=inputs(),bundle=buildBondSelectionEvidence(value),result=writeBondSelectionEvidence(directory,bundle,value);assert.equal(result.fileCount,6);assert.deepEqual(fs.readdirSync(directory).sort(),["RUNBOOK.md","candidate-inspection.json","governance-approval-plan.json","manifest.json","multi-rpc-preflight.json","selection-deploy-plan.json"]);assert.throws(()=>writeBondSelectionEvidence(directory,bundle,value),/empty output/);});
});
