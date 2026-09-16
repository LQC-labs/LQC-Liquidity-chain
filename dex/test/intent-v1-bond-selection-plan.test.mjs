import assert from "node:assert/strict";
import { ethers } from "ethers";
import { canonicalDigest } from "../scripts/build-intent-reproducibility-seal.mjs";
import { buildBondSelectionPlan } from "../scripts/prepare-intent-bond-selection.mjs";

describe("LQC Intent Bond selection Stage-0 plan",function(){
  const token="0x0000000000000000000000000000000000000010",selectionContract="0x0000000000000000000000000000000000000020",inspection={results:[{token,decimals:18,network:{chainId:97},observedBlock:12345,assessment:{eligible:true}}]},iface=new ethers.Interface(["function approveBondToken(address token,bytes32 digest)"]);
  it("builds the Governance-owned selection recorder deployment",async function(){const plan=await buildBondSelectionPlan({inspection,bondToken:token});assert.equal(plan.stage,"stage0-selection-recorder-deploy");assert.equal(plan.action.to,null);assert.equal(plan.action.actor,"deployer");assert.equal(plan.action.data.startsWith("0x60"),true);assert.equal(plan.inspectionDigest,canonicalDigest(inspection));assert.equal(plan.transactionOccurred,false);});
  it("builds exact approval calldata and deterministic SafeTx hash",async function(){const plan=await buildBondSelectionPlan({inspection,bondToken:token,selectionContract,safeNonce:7}),decoded=iface.decodeFunctionData("approveBondToken",plan.action.data);assert.equal(decoded[0],token);assert.equal(decoded[1],`0x${canonicalDigest(inspection).slice(7)}`);assert.equal(plan.safeTransaction.nonce,"7");assert.equal(ethers.isHexString(plan.safeTransactionHash,32),true);assert.equal(plan.action.actor,"governance-safe");});
  it("rejects ineligible, ambiguous and stale-nonce inputs",async function(){await assert.rejects(buildBondSelectionPlan({inspection:{results:[{...inspection.results[0],assessment:{eligible:false}}]},bondToken:token}),/eligible/);await assert.rejects(buildBondSelectionPlan({inspection:{results:[inspection.results[0],inspection.results[0]]},bondToken:token}),/one eligible/);await assert.rejects(buildBondSelectionPlan({inspection,bondToken:token,selectionContract,safeNonce:null}),/nonce/);});
});
