// M28 — read-only source-of-funds reconciliation of frozen M08 observations.
// Offline only: no RPC, token movement, signing or operational approval.
import {readFileSync} from "node:fs";
import {pathToFileURL} from "node:url";

const A=/^0x[0-9a-f]{40}$/i, H=/^0x[0-9a-f]{64}$/i;
const VAULT="0xb532c65294a7b35ca510a7df025e934fa17c8d7e";
const TOKEN="0x7ab1b97d194730e9456c12af7905450a4f8a0c46";
const USER="0xde05e09db1292aff6ab62164134f1ad384bca6fb";
const SNAPSHOT_HASH="0x7a0d76a80ecc8b13d9eb7e2f1c7a5e3f96f16d3233d8d02c3f842c95a07d6208";
const nonneg=(v,name)=>{if(typeof v!=="string"||!/^(0|[1-9][0-9]*)$/.test(v))throw Error(name+" must be base-ten integer string");return BigInt(v)};
const addr=(v,name)=>{if(typeof v!=="string"||!A.test(v))throw Error("invalid "+name);return v.toLowerCase()};
const hash=(v,name)=>{if(typeof v!=="string"||!H.test(v))throw Error("invalid "+name);return v.toLowerCase()};
const nat=(v,name)=>{if(!Number.isSafeInteger(v)||v<0)throw Error("invalid "+name);return v};
const unique=(arr,name)=>{if(new Set(arr).size!==arr.length)throw Error("duplicate "+name)};

export function reconcileM28(input){
 const result={schema:"lqc-m28-provenance-reconciliation-result-v1",status:"BLOCKED",
  sourceClassification:"UNVERIFIED",knownAccountRightsPreserved:false,
  provenDistributableSurplus:"0",verifiedExternalSourceOfFunds:false,
  fullHistoricalInventoryComplete:false,allReceiptsIndependent:false,
  operationalPayoutAuthorized:false,migrationAuthorized:false,
  gaps:[],unattributedTokenTransfers:[],unmatchedVaultEvents:[]};
 try{
  if(!input||input.schema!=="lqc-m28-source-reconciliation-v1")throw Error("schema mismatch");
  if(input.chainId!==97||input.snapshotBlock!==144115366||hash(input.snapshotHash,"snapshotHash")!==SNAPSHOT_HASH)
   throw Error("frozen chain/block anchor mismatch");
  if(addr(input.vault,"vault")!==VAULT||addr(input.token,"token")!==TOKEN)throw Error("wrong Vault/token");
  const reference=input.m08;
  if(!reference||reference.chainId!==97||
    reference.indexed_evidence?.fromBlock!==131945040||
    reference.indexed_evidence?.toBlockExclusive!==144115367||
    reference.independent_receipt_and_balance_crosscheck?.snapshotBlock!==144115366||
    hash(reference.independent_receipt_and_balance_crosscheck?.snapshotHash,"M08 hash")!==SNAPSHOT_HASH)
    throw Error("M08 observation mismatch");
  const events=reference.indexed_evidence.events;
  const checks=reference.independent_receipt_and_balance_crosscheck.checks;
  if(!Array.isArray(events)||events.length!==5||!Array.isArray(checks)||checks.length!==5)
   throw Error("missing frozen M08 lifecycle observations");
  for(const e of events){
   nat(e.blockNumber,"M08 block");nat(e.logIndex,"M08 log index");
   const k=hash(e.transactionHash,"M08 transactionHash")+":"+e.logIndex;
   if(!checks.some(c=>hash(c.tx,"M08 receipt hash")+":"+c.logIndex===k&&c.receiptVerified===true))
    throw Error("M08 event/receipt mismatch");
  }
  const snapshot=reference.independent_receipt_and_balance_crosscheck;
  if(addr(snapshot.knownAccount?.account,"known account")!==USER||
     snapshot.knownAccount?.open!==false||
     nonneg(snapshot.knownAccount?.lockedBalance,"known locked")!==0n)
    throw Error("known account position state mismatch");
  const available=nonneg(snapshot.knownAccount.availableBalance,"available");
  const accounted=nonneg(snapshot.vault?.totalAccounted,"accounted");
  const assets=nonneg(snapshot.vault?.actualTokenBalance,"assets");
  if(available!==5000000000000000000000n||available!==accounted||accounted!==assets)
    throw Error("known account custody mismatch");
  result.knownAccountRightsPreserved=true;
  result.knownUserAvailable=available.toString();
  result.accounted=accounted.toString();
  result.physicalAssets=assets.toString();
  result.rawPhysicalExcess=(assets-accounted).toString();
  result.status="KNOWN_ACCOUNT_ANCHOR_PASS__SOURCE_PROVENANCE_BLOCKED";
  if(input.deploymentAnchorOnly===true){
   result.gaps.push("No independently decoded ERC20 transfer receipts or token amount-bearing Vault event logs supplied.");
   result.gaps.push("Historical selected-seven-topic indexer observations do not prove global completeness.");
   result.gaps.push("Historical MVP lacks modern Funding/Insurance and protocol-surplus entitlements.");
   return result;
  }
  const transfers=input.tokenTransfers;
  const accounting=input.vaultAccountingEvents;
  if(!Array.isArray(transfers)||!Array.isArray(accounting))throw Error("tokenTransfers and vaultAccountingEvents required");
  const txEventIds=events.map(e=>hash(e.transactionHash,"M08 tx")+":"+e.logIndex);
  unique(txEventIds,"M08 event ids");
  const transferIds=[],ledgerIds=[];
  const matching=new Set();
  for(const [i,e] of accounting.entries()){
   const tx=hash(e.tx,"vault event tx");const index=nat(e.logIndex,"Vault event log");
   ledgerIds.push(tx+":"+index);
   if(!["Deposit","Withdrawal"].includes(e.name))throw Error("unexpected amount-bearing Vault event");
   if(addr(e.account,"Vault account")!==USER)throw Error("unrecognized account inventory");
   if(addr(e.token,"Vault event token")!==TOKEN)throw Error("unexpected collateral token");
   nonneg(e.amount,"Vault event amount");
   if(e.receiptVerified!==true)result.gaps.push("Vault event receipt not independently verified: "+tx);
  }
  unique(ledgerIds,"Vault event");
  let credited=0n,debited=0n;
  for(const [i,t] of transfers.entries()){
   const tx=hash(t.tx,"transfer tx");const index=nat(t.logIndex,"transfer log");
   transferIds.push(tx+":"+index);
   if(addr(t.token,"transfer token")!==TOKEN)throw Error("unsupported token transfer");
   const from=addr(t.from,"transfer from"),to=addr(t.to,"transfer to");
   const amount=nonneg(t.amount,"transfer amount");
   if(amount===0n)throw Error("zero transfer amount");
   if(from!==VAULT&&to!==VAULT)throw Error("transfer unrelated to Vault");
   if(t.receiptVerified!==true)result.gaps.push("ERC20 transfer receipt not independently verified: "+tx);
   const expectedName=to===VAULT?"Deposit":"Withdrawal";
   const entries=accounting.filter(e=>hash(e.tx,"event tx")===tx&&e.name===expectedName&&
       addr(e.account,"event account")===(to===VAULT?from:to)&&nonneg(e.amount,"event amount")===amount);
   if(entries.length===1&&from!==to){
    matching.add(accounting.indexOf(entries[0]));
    if(expectedName==="Deposit")credited+=amount;else debited+=amount;
   } else {
    result.unattributedTokenTransfers.push({tx,logIndex:index,direction:to===VAULT?"IN":"OUT",amount:amount.toString()});
   }
  }
  unique(transferIds,"ERC20 transfer");
  for(let i=0;i<accounting.length;i++){
   if(!matching.has(i))result.unmatchedVaultEvents.push({tx:accounting[i].tx,name:accounting[i].name,logIndex:accounting[i].logIndex});
  }
  result.matchedIncomingTokens=credited.toString();
  result.matchedOutgoingTokens=debited.toString();
  if(result.unattributedTokenTransfers.length)result.gaps.push("Unattributed transfers are NOT protocol-owned assets.");
  if(result.unmatchedVaultEvents.length)result.gaps.push("Vault accounting has unmatched ERC20 transfers.");
  if(credited<debited||credited-debited!==available)
   result.gaps.push("Receipt transfer flow does not reconcile to known-account snapshot.");
  if(input.completeTokenTransferHistoryAttested!==true)
   result.gaps.push("Independent complete ERC20 Transfer history coverage not attested.");
  if(input.completeVaultEventHistoryAttested!==true)
   result.gaps.push("Independent Vault account/event completeness not attested.");
  if(input.independentCustodyOwnershipReviewed!==true)
   result.gaps.push("Independent ownership and economic entitlement not attested.");
  // No classification of surplus based on caller's booleans alone.
  result.gaps.push("No signed economic entitlement, historical all-account claim inventory, or approved payout right.");
  result.status=result.gaps.length?"SOURCE_PROVENANCE_BLOCKED":"UNREVIEWED_SOURCE_FORMAT";
  return result;
 }catch(e){result.status="FAIL";result.gaps.push(String(e?.message||e));return result;}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 if(process.argv.length!==3){console.error("Usage: node scripts/reconcile-futures-m28-source-of-funds.mjs INPUT.json");process.exitCode=2;}
 else try{const r=reconcileM28(JSON.parse(readFileSync(process.argv[2],"utf8")));console.log(JSON.stringify(r,null,2));if(r.status==="FAIL")process.exitCode=1;}
 catch(e){console.error(String(e));process.exitCode=2;}
}
