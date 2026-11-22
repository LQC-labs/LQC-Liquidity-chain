import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {reconcileM28} from "../scripts/reconcile-futures-m28-source-of-funds.mjs";

const frozen=JSON.parse(readFileSync(new URL("./fixtures/futures-m08-frozen-observation.json",import.meta.url),"utf8"));
const VAULT="0xb532c65294a7b35ca510a7df025e934fa17c8d7e";
const TOKEN="0x7ab1b97d194730e9456c12af7905450a4f8a0c46";
const USER="0xde05e09db1292aff6ab62164134f1ad384bca6fb";
const TX=frozen.indexed_evidence.events[0].transactionHash;
const BASE={
 schema:"lqc-m28-source-reconciliation-v1",
 chainId:97,snapshotBlock:144115366,
 snapshotHash:"0x7a0d76a80ecc8b13d9eb7e2f1c7a5e3f96f16d3233d8d02c3f842c95a07d6208",
 vault:VAULT,token:TOKEN,m08:frozen,
 deploymentAnchorOnly:true
};
const snapshot=()=>structuredClone(BASE);
function syntheticTransfers(){
 const f=snapshot();delete f.deploymentAnchorOnly;
 f.tokenTransfers=[{tx:TX,logIndex:6,token:TOKEN,from:USER,to:VAULT,
    amount:"5000000000000000000000",receiptVerified:true}];
 f.vaultAccountingEvents=[{tx:TX,logIndex:7,name:"Deposit",account:USER,token:TOKEN,
    amount:"5000000000000000000000",receiptVerified:true}];
 f.completeTokenTransferHistoryAttested=false;
 f.completeVaultEventHistoryAttested=false;
 f.independentCustodyOwnershipReviewed=false;
 return f;
}
test("M28 actual frozen M08 has known-account 5000 mUSDT PASS but provenance BLOCKED",()=>{
 const r=reconcileM28(snapshot());
 assert.equal(r.status,"KNOWN_ACCOUNT_ANCHOR_PASS__SOURCE_PROVENANCE_BLOCKED");
 assert.equal(r.knownAccountRightsPreserved,true);
 assert.equal(r.knownUserAvailable,"5000000000000000000000");
 assert.equal(r.rawPhysicalExcess,"0");
 assert.equal(r.provenDistributableSurplus,"0");
 assert.equal(r.fullHistoricalInventoryComplete,false);
 assert.equal(r.operationalPayoutAuthorized,false);
 assert.ok(r.gaps.some(x=>x.includes("ERC20 transfer")));
});
test("M28 synthetic matching ERC20 transfer and Vault deposit cannot claim ownership",()=>{
 const r=reconcileM28(syntheticTransfers());
 assert.equal(r.matchedIncomingTokens,"5000000000000000000000");
 assert.equal(r.matchedOutgoingTokens,"0");
 assert.equal(r.unattributedTokenTransfers.length,0);
 assert.equal(r.unmatchedVaultEvents.length,0);
 assert.equal(r.status,"SOURCE_PROVENANCE_BLOCKED");
 assert.equal(r.verifiedExternalSourceOfFunds,false);
 assert.equal(r.provenDistributableSurplus,"0");
});
test("M28 synthetic unexplained direct Vault transfer is UNATTRIBUTED, not spendable",()=>{
 const f=syntheticTransfers();
 f.tokenTransfers.push({tx:"0x"+"cd".repeat(32),logIndex:8,token:TOKEN,from:"0x"+"aa".repeat(20),
    to:VAULT,amount:"700",receiptVerified:true});
 const r=reconcileM28(f);
 assert.equal(r.status,"SOURCE_PROVENANCE_BLOCKED");
 assert.equal(r.unattributedTokenTransfers.length,1);
 assert.equal(r.unattributedTokenTransfers[0].amount,"700");
 assert.equal(r.provenDistributableSurplus,"0");
});
test("M28 synthetic Vault deposit without matching transfer is flagged",()=>{
 const f=syntheticTransfers();
 f.tokenTransfers=[];
 const r=reconcileM28(f);
 assert.equal(r.unmatchedVaultEvents.length,1);
 assert.ok(r.gaps.some(x=>x.includes("Receipt transfer flow")));
});
test("M28 wrong chain block or token fails",()=>{
 for(const patch of [f=>f.chainId=56,f=>f.snapshotBlock=144115367,
   f=>f.snapshotHash="0x"+"11".repeat(32),f=>f.token="0x"+"aa".repeat(20)]){
  const f=snapshot();patch(f);assert.equal(reconcileM28(f).status,"FAIL");
 }
});
test("M28 missing receipt and tampered M08 facts fail closed",()=>{
 const f=snapshot();f.m08.independent_receipt_and_balance_crosscheck.checks[0].receiptVerified=false;
 assert.equal(reconcileM28(f).status,"FAIL");
 const g=snapshot();g.m08.independent_receipt_and_balance_crosscheck.vault.actualTokenBalance="4999";
 assert.equal(reconcileM28(g).status,"FAIL");
});
test("M28 duplicate transfer identity fails",()=>{
 const f=syntheticTransfers();f.tokenTransfers.push({...f.tokenTransfers[0]});
 assert.equal(reconcileM28(f).status,"FAIL");
});
test("M28 synthetic receiptVerified flags alone still never authorize payout",()=>{
 const f=syntheticTransfers();
 f.completeTokenTransferHistoryAttested=true;
 f.completeVaultEventHistoryAttested=true;
 f.independentCustodyOwnershipReviewed=true;
 const r=reconcileM28(f);
 assert.equal(r.provenDistributableSurplus,"0");
 assert.equal(r.operationalPayoutAuthorized,false);
 assert.ok(r.gaps.some(x=>x.includes("signed economic entitlement")));
});
test("M28 malformed negative amount is fail",()=>{
 const f=syntheticTransfers();f.tokenTransfers[0].amount="-1";
 assert.equal(reconcileM28(f).status,"FAIL");
});
