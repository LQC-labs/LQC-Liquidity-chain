// M08 -> M07 legacy migration evidence bridge.
// Pure/offline. This is NOT an M07 modern-schema snapshot and NEVER authorizes cutover.
import {readFileSync} from "node:fs";
import {pathToFileURL} from "node:url";

const ADDR=/^0x[0-9a-f]{40}$/i, HASH=/^0x[0-9a-f]{64}$/i;
const ENGINE="0xe4f1320c8709631776c7e39e0916584935882525";
const VAULT="0xb532c65294a7b35ca510a7df025e934fa17c8d7e";
const TOKEN="0x7ab1b97d194730e9456c12af7905450a4f8a0c46";
const START=131945040, SNAPSHOT=144115366;
const REQUIRED=new Set(["Deposit","CollateralLocked","PositionOpened","CollateralUnlocked","PositionClosed"]);
const addr=(s)=>typeof s==="string"&&ADDR.test(s)?s.toLowerCase():null;
const num=(s)=>typeof s==="string"&&/^(0|[1-9][0-9]*)$/.test(s)?BigInt(s):null;
const fail=(r,reason)=>r.failures.push(reason);
const block=(r,reason)=>r.blockers.push(reason);

export function reviewLegacyM08Evidence(bundle) {
  const r={workId:"76-17-⑥-⑤/M08→M07",status:"BLOCKED",
    profile:"HISTORICAL_BSC97_MVP_FUTURES_ONLY",knownAccountReconciled:false,
    independenceAttested:false,completeInventoryAttested:false,
    operationalCutoverAuthorized:false,failures:[],blockers:[],
    unsupportedModernFields:["openInterestUsd","fundingStates","positionFundingEntryRay",
      "fundingLedgers","fundingPoolBalance","insuranceFeeReserve","treasuryFeeReserve",
      "residualBadDebt","totalInsuranceCovered"]};
  try {
    if(!bundle || bundle.chainId!==97)throw Error("wrong chain or missing bundle");
    const e=bundle.indexed_evidence, x=bundle.independent_receipt_and_balance_crosscheck;
    if(!e||!x||x.chainId!==97)throw Error("missing independently collected parts");
    if(e.schema!=="lqc-m08-hypersync-bounded-pilot-v1"||
      x.schema!=="lqc-m08-independent-receipt-reconciliation-v1")throw Error("wrong evidence schema");
    if(e.fromBlock!==START || e.toBlockExclusive!==SNAPSHOT+1 ||
      e.scannedThroughExclusive!==SNAPSHOT+1 || x.snapshotBlock!==SNAPSHOT)
      throw Error("historical coverage/snapshot boundary mismatch");
    if(!HASH.test(x.snapshotHash||""))throw Error("missing block hash");
    if(e.status!=="BOUNDED_WINDOW_EVIDENCE_PASS"||e.coverageComplete!==true ||
      e.fullHistoricalInventoryComplete!==false)throw Error("indexed observation status inconsistent");
    if(x.status!=="KNOWN_ACCOUNT_RECEIPTS_AND_BALANCES_PASS")throw Error("receipt observation not PASS");
    if(e.transactionOccurred!==false||x.transactionOccurred!==false||
       e.operationalCutoverAuthorized!==false||x.operationalCutoverAuthorized!==false)
      throw Error("write/authorization flags incompatible");

    const pages=e.pages;
    if(!Array.isArray(pages)||!pages.length)throw Error("no indexed pagination evidence");
    let cursor=START,totalLogs=0;
    for(const page of pages){
      if(!Number.isSafeInteger(page.from)||!Number.isSafeInteger(page.toExclusive)||
        page.from!==cursor||page.toExclusive<=cursor||page.completed!==true||
        page.truncated!==false||!Number.isSafeInteger(page.logCount))
        throw Error("invalid, overlapping or incomplete indexed page");
      cursor=page.toExclusive;totalLogs+=page.logCount;
    }
    if(cursor!==SNAPSHOT+1)throw Error("missing indexed range");
    const ev=e.events, checks=x.checks;
    if(!Array.isArray(ev)||!Array.isArray(checks)||
       ev.length!==totalLogs||checks.length!==ev.length)throw Error("event/receipt count disagreement");
    const ids=new Set(),observedNames=new Set(),accounts=new Set();
    for(const event of ev){
      const contract=event.contract==="Engine"?ENGINE:event.contract==="Vault"?VAULT:null;
      if(!contract||!REQUIRED.has(event.name))throw Error("unexpected contract/event type");
      if(!Number.isSafeInteger(event.blockNumber)||event.blockNumber<START||
        event.blockNumber>SNAPSHOT||!HASH.test(event.transactionHash||"")||
        !Number.isSafeInteger(event.logIndex)||!addr(event.account))
        throw Error("malformed indexed event");
      const id=event.transactionHash.toLowerCase()+":"+event.logIndex;
      if(ids.has(id))throw Error("duplicate indexed event identity");
      ids.add(id);observedNames.add(event.name);accounts.add(addr(event.account));
      if(!checks.some(c=>c.receiptVerified===true&&c.name===event.name&&
        c.tx?.toLowerCase()===event.transactionHash.toLowerCase()&&
        c.logIndex===event.logIndex&&c.block===event.blockNumber))
        throw Error("indexed event lacks matching receipt verification");
    }
    if([...REQUIRED].some(n=>!observedNames.has(n)))throw Error("expected lifecycle event missing");
    if(!Array.isArray(e.accounts)||e.accounts.length!==accounts.size||
      e.accounts.some(a=>!accounts.has(addr(a))))throw Error("indexed account set mismatch");
    const known=x.knownAccount,vault=x.vault;
    if(!known||!vault||!accounts.has(addr(known.account)))throw Error("known account missing");
    const balances=["margin","sizeUsd","availableBalance","lockedBalance"]
      .map(k=>num(known[k]));
    const total=num(vault.totalAccounted),actual=num(vault.actualTokenBalance);
    if([...balances,total,actual].some(v=>v===null))throw Error("invalid unsigned balance");
    if(known.open!==false||balances[0]!==0n||balances[1]!==0n||
      balances[3]!==0n)fail(r,"Known account is not flat at frozen block");
    if(balances[2]!==total||total!==actual)fail(r,"Known account and Vault do not reconcile");
    r.knownAccount=addr(known.account);
    r.observedEvents=ev.length;
    r.observedAccounts=accounts.size;
    r.snapshotBlock=SNAPSHOT;
    r.snapshotHash=x.snapshotHash;
    r.indexedRange={from:START,to:SNAPSHOT};
    if(!r.failures.length)r.knownAccountReconciled=true;
    block(r,"Provider historical retention/completeness and contract event scope not independently attested");
    block(r,"Historical MVP does not expose required modern M07 Engine/Funding/Insurance getters");
    block(r,"No approved modern migration or rollback policy; independent security sign-off absent");
    block(r,"Account totals matching known user do not establish complete global user inventory");
  }catch(err){fail(r,String(err?.message||err));}
  r.status=r.failures.length?"FAIL":"BLOCKED";
  return r;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  if(process.argv.length!==3){console.error("Usage: node scripts/review-futures-m08-for-m07.mjs M08_BUNDLE.json");process.exitCode=2;}
  else try{const r=reviewLegacyM08Evidence(JSON.parse(readFileSync(process.argv[2],"utf8")));
    console.log(JSON.stringify(r,null,2)); if(r.status==="FAIL")process.exitCode=1;
  }catch(e){console.error(String(e.message));process.exitCode=2;}
}
