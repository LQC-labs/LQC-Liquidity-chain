// M31 — pure offline archive export validator, no external requests or transactions.
// Input is an independently collected log export with contiguous per-filter intervals.
// A self-asserted source name or 'complete' flag never proves an independent provider.
import {readFileSync} from "node:fs";
import {pathToFileURL} from "node:url";
const FIRST=131945040,LAST=144115366;
const HASH="0x7a0d76a80ecc8b13d9eb7e2f1c7a5e3f96f16d3233d8d02c3f842c95a07d6208";
const VAULT="0xb532c65294a7b35ca510a7df025e934fa17c8d7e";
const TOKEN="0x7ab1b97d194730e9456c12af7905450a4f8a0c46";
const E=[
 ["0x263e7d9135a646caa958e3a317867a13f056e0c712ddd9429d9b432a2d45cda0",7,"OwnershipTransferred","vault"],
 ["0x7ed4a0789aa89b091919e82b32c52b04d5ac3d1c17754c5db115877b1262cff5",13,"EngineChanged","vault"],
 ["0x7a1e7681d44716fb1d662fe9a733adf3285bda5432bcbd64582b74ed5993b3c7",19,"CollateralSupportChanged","vault"],
 ["0x00a756b77545a0ddc732f424f81c179c7d71119427108a50a1e43fa56be988f1",7,"Deposit","vault"],
 ["0x4cb9207fc918ee50b5895ab348d411f25258164d1ae78a0eb2f12b13071373e4",11,"CollateralLocked","vault"],
 ["0x4a2330fb4ac5938d2db84f360c8f7971a4c7878807a5422715493f7a2b3fee19",13,"CollateralUnlocked","vault"],
 ["0x00a756b77545a0ddc732f424f81c179c7d71119427108a50a1e43fa56be988f1",6,"Transfer","token_in"]
];
const lower=x=>String(x??"").toLowerCase();
const key=(tx,index)=>lower(tx)+":"+index;
const expectByKey=new Map(E.map(([tx,i,name,kind])=>[key(tx,i),{name,kind}]));
const addr=/^0x[0-9a-f]{40}$/i, hash=/^0x[0-9a-f]{64}$/i;
const nat=(x,n)=>{if(!Number.isSafeInteger(x)||x<0)throw Error(n+" invalid");return x};
const amount=(x,n)=>{if(typeof x!=="string"||!/^(0|[1-9][0-9]*)$/.test(x))throw Error(n+" invalid");return BigInt(x)};
export function reviewM31(input){
 const out={schema:"lqc-m31-archive-export-verdict-v1",status:"BLOCKED",
  formatRangeComplete:false,expectedKnownEventsMatched:0,
  independentProviderProven:false,globalClaimCompleteness:false,
  spendableProtocolSurplus:"0",payoutAuthorized:false,migrationAuthorized:false,
  missingIds:[],unexpectedIds:[],gaps:[],details:[]};
 try{
  if(!input||input.schema!=="lqc-m31-archive-log-export-v1")throw Error("schema invalid");
  if(input.chainId!==97||input.fromBlock!==FIRST||input.toBlockInclusive!==LAST||
    lower(input.snapshotHash)!==HASH)throw Error("frozen anchor mismatch");
  if(lower(input.vault)!==VAULT||lower(input.token)!==TOKEN)throw Error("contract anchor mismatch");
  const feeds=input.streams;
  if(!Array.isArray(feeds)||feeds.length!==3)throw Error("exactly vault/token_out/token_in filters required");
  const scope=new Map();
  const seen=new Map();
  for(const stream of feeds){
   if(!["vault","token_out","token_in"].includes(stream.kind)||scope.has(stream.kind))
    throw Error("bad/duplicate filter");
   scope.set(stream.kind,stream);
   if(!Array.isArray(stream.ranges))throw Error("ranges missing");
   let cursor=FIRST;
   for(const window of stream.ranges){
    const from=nat(window.from,"range from"),to=nat(window.to,"range to");
    if(from!==cursor||to<from||to>LAST)throw Error("gap, overlap or unsorted archive range");
    if(window.success!==true||window.truncated===true||window.error)
      throw Error("unverified or truncated archive range");
    if(!Array.isArray(window.logs))throw Error("range logs absent");
    for(const log of window.logs){
     if(!hash.test(log.tx)||!Number.isSafeInteger(log.logIndex)||
       log.logIndex<0||!Number.isSafeInteger(log.blockNumber)||
       log.blockNumber<from||log.blockNumber>to)
       throw Error("invalid archive event identity");
     if(!addr.test(log.address))throw Error("invalid archive event address");
     if(stream.kind==="vault"&&lower(log.address)!==VAULT)throw Error("vault address mismatch");
     if(stream.kind!=="vault"&&lower(log.address)!==TOKEN)throw Error("token address mismatch");
     const id=key(log.tx,log.logIndex);
     if(seen.has(id))throw Error("duplicate archive event "+id);
     seen.set(id,{...log,kind:stream.kind});
     if(typeof log.name!=="string"||!log.name)throw Error("unknown event type");
     if(log.name==="Transfer"){
      if(stream.kind==="vault")throw Error("transfer indexed as Vault");
      if(!addr.test(log.from)||!addr.test(log.to))throw Error("transfer endpoint invalid");
      if(stream.kind==="token_in"&&lower(log.to)!==VAULT)throw Error("wrong inbound endpoint");
      if(stream.kind==="token_out"&&lower(log.from)!==VAULT)throw Error("wrong outbound endpoint");
      amount(log.amount,"ERC20 amount");
     }else if(stream.kind!=="vault")throw Error("non-transfer in token stream");
    }
    cursor=to+1;
   }
   if(cursor!==LAST+1)out.gaps.push({kind:stream.kind,nextBlock:cursor,through:LAST});
  }
  out.formatRangeComplete=out.gaps.length===0;
  for(const [id,expected] of expectByKey){
   const found=seen.get(id);
   if(!found||found.name!==expected.name||found.kind!==expected.kind)out.missingIds.push(id);
   else out.expectedKnownEventsMatched++;
  }
  for(const [id] of seen)if(!expectByKey.has(id))out.unexpectedIds.push(id);
  const transfer=seen.get(key(E[6][0],6)),deposit=seen.get(key(E[3][0],7));
  if(transfer){
   if(lower(transfer.from)!=="0xde05e09db1292aff6ab62164134f1ad384bca6fb"||
      lower(transfer.to)!==VAULT||amount(transfer.amount,"deposit Transfer")!==5000n*10n**18n)
    throw Error("known receipt Transfer values wrong");
  }
  if(deposit && (lower(deposit.account)!=="0xde05e09db1292aff6ab62164134f1ad384bca6fb"||
    lower(deposit.token)!==TOKEN||amount(deposit.amount,"Deposit amount")!==5000n*10n**18n))
   throw Error("known Vault Deposit values wrong");
  const consistent=out.formatRangeComplete&&!out.missingIds.length&&!out.unexpectedIds.length;
  out.status=consistent?"INDEPENDENT_EXPORT_FORMAT_AND_EVENT_SET_MATCH__AUTHENTICITY_BLOCKED":
   "INCOMPLETE_OR_DIVERGENT_ARCHIVE_EXPORT__BLOCKED";
  out.details.push("Provider identity, block hash authenticity, returned log integrity, archive retention and other token/user claims must be independently corroborated.");
  out.details.push("Self-asserted completed ranges cannot prove provider-level historical completeness.");
  out.details.push("No wallet signature, owner attestation or economic payout authority is derived.");
 }catch(e){out.status="FAIL";out.details.push(String(e?.message||e));}
 return out;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 if(process.argv.length!==3){console.error("Usage: node scripts/verify-futures-m31-archive-export.mjs EXPORT.json");process.exitCode=2;}
 else {const r=reviewM31(JSON.parse(readFileSync(process.argv[2],"utf8")));console.log(JSON.stringify(r,null,2));if(r.status==="FAIL")process.exitCode=1;}
}
