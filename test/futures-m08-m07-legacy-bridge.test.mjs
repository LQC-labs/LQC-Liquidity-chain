import test from "node:test";
import assert from "node:assert/strict";
import {reviewLegacyM08Evidence} from "../scripts/review-futures-m08-for-m07.mjs";

const ENGINE="0xe4f1320c8709631776c7e39e0916584935882525";
const ACCOUNT="0xde05e09db1292aff6ab62164134f1ad384bca6fb";
const TXS=["0x"+"aa".repeat(32),"0x"+"bb".repeat(32),"0x"+"bb".repeat(32),
  "0x"+"cc".repeat(32),"0x"+"cc".repeat(32)];
const names=["Deposit","CollateralLocked","PositionOpened","CollateralUnlocked","PositionClosed"];
function fixture(){
  const events=names.map((name,i)=>({
    contract:i===2||i===4?"Engine":"Vault",name,
    blockNumber:131978250+(i>0?i<3?2571:5834:0),
    transactionHash:TXS[i],logIndex:i,account:ACCOUNT,marketId:i===2||i===4?"1":null
  }));
  const checks=events.map(e=>({name:e.name,tx:e.transactionHash,logIndex:e.logIndex,
    block:e.blockNumber,receiptVerified:true}));
  return {chainId:97,
    indexed_evidence:{schema:"lqc-m08-hypersync-bounded-pilot-v1",chainId:97,
      fromBlock:131945040,toBlockExclusive:144115367,scannedThroughExclusive:144115367,
      status:"BOUNDED_WINDOW_EVIDENCE_PASS",coverageComplete:true,
      fullHistoricalInventoryComplete:false,transactionOccurred:false,operationalCutoverAuthorized:false,
      pages:[{from:131945040,toExclusive:144115367,logCount:5,completed:true,truncated:false}],
      events,accounts:[ACCOUNT]},
    independent_receipt_and_balance_crosscheck:{
      schema:"lqc-m08-independent-receipt-reconciliation-v1",chainId:97,
      snapshotBlock:144115366,snapshotHash:"0x"+"ff".repeat(32),
      status:"KNOWN_ACCOUNT_RECEIPTS_AND_BALANCES_PASS",transactionOccurred:false,
      operationalCutoverAuthorized:false,checks,
      knownAccount:{account:ACCOUNT,open:false,margin:"0",sizeUsd:"0",
        lockedBalance:"0",availableBalance:"5000000000000000000000"},
      vault:{totalAccounted:"5000000000000000000000",
        actualTokenBalance:"5000000000000000000000"}}
  };
}
const copy=()=>structuredClone(fixture());
test("M08 legacy evidence reconciles but never returns operational PASS",()=>{
  const r=reviewLegacyM08Evidence(copy());
  assert.equal(r.status,"BLOCKED");
  assert.equal(r.knownAccountReconciled,true);
  assert.equal(r.operationalCutoverAuthorized,false);
  assert.equal(r.completeInventoryAttested,false);
  assert.ok(r.unsupportedModernFields.includes("fundingLedgers"));
  assert.equal(r.observedEvents,5);
});
test("M08 refuses invented or altered account balance",()=>{
  const d=copy();d.independent_receipt_and_balance_crosscheck.vault.totalAccounted="999";
  const r=reviewLegacyM08Evidence(d);
  assert.equal(r.status,"FAIL");assert.equal(r.knownAccountReconciled,false);
});
test("M08 rejects missing or altered receipt evidence",()=>{
  const d=copy();d.independent_receipt_and_balance_crosscheck.checks.pop();
  assert.equal(reviewLegacyM08Evidence(d).status,"FAIL");
  const e=copy();e.independent_receipt_and_balance_crosscheck.checks[0].receiptVerified=false;
  assert.equal(reviewLegacyM08Evidence(e).status,"FAIL");
});
test("M08 rejects false provider coverage and duplicate logs",()=>{
  const d=copy();d.indexed_evidence.pages[0].toExclusive=144115360;
  assert.equal(reviewLegacyM08Evidence(d).status,"FAIL");
  const e=copy();e.indexed_evidence.events[1].logIndex=e.indexed_evidence.events[0].logIndex;
  e.indexed_evidence.events[1].transactionHash=e.indexed_evidence.events[0].transactionHash;
  assert.equal(reviewLegacyM08Evidence(e).status,"FAIL");
});
test("M08 rejects fabricated modern accounting claims",()=>{
  const d=copy();d.indexed_evidence.fullHistoricalInventoryComplete=true;
  assert.equal(reviewLegacyM08Evidence(d).status,"FAIL");
});
