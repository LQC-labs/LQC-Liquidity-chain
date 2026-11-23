// 76-17-⑥-⑤ / M37 — one 10,000-block QuickNode/HyperSync historical pilot.
// Four read-only requests maximum: one indexer + three archival RPC log filters.
// No bulk sweep, no credentials or URLs in result JSON, no asset operations.
import {ethers} from "ethers";
import {createHash} from "node:crypto";
import {writeFileSync} from "node:fs";
import {pathToFileURL} from "node:url";
import {ANCHOR,validateEndpoint,DEPOSIT_TOPIC} from "./probe-futures-m32-quicknode-archive.mjs";

const FROM=131975000, TO_EXCLUSIVE=131985000, MAX_LOGS=100, BUDGET=4;
const HYPERSYNC="https://bsc-testnet.hypersync.xyz/query";
const TOPIC=ethers.id("Transfer(address,address,uint256)").toLowerCase();
const PAD_VAULT=ethers.zeroPadValue(ANCHOR.vault,32).toLowerCase();
const PAD_USER=ethers.zeroPadValue(ANCHOR.user,32).toLowerCase();
const PAD_TOKEN=ethers.zeroPadValue(ANCHOR.token,32).toLowerCase();
const hex=n=>"0x"+n.toString(16),lower=x=>String(x??"").toLowerCase();
const eventId=e=>e.tx+":"+e.logIndex;
const canonical=e=>JSON.stringify([e.address,e.blockNumber,e.tx,e.logIndex,e.topics,e.data]);
const sha=logs=>createHash("sha256").update(logs.map(canonical).sort().join("\n")).digest("hex");
function normalize(raw,indexed=false){
 const e={address:lower(raw.address),
  blockNumber:Number(indexed?raw.block_number:BigInt(raw.blockNumber)),
  tx:lower(indexed?raw.transaction_hash:raw.transactionHash),
  logIndex:Number(indexed?raw.log_index:BigInt(raw.logIndex)),
  topics:(indexed?[raw.topic0,raw.topic1,raw.topic2,raw.topic3].filter(x=>x!=null):raw.topics).map(lower),
  data:lower(raw.data||"0x")};
 if(!ethers.isAddress(e.address)||!ethers.isHexString(e.tx,32)||
    !Number.isSafeInteger(e.blockNumber)||e.blockNumber<FROM||e.blockNumber>=TO_EXCLUSIVE||
    !Number.isSafeInteger(e.logIndex)||e.logIndex<0||
    !e.topics.length||!e.topics.every(x=>ethers.isHexString(x,32))||!ethers.isHexString(e.data))
  throw Error("Malformed historical event");
 if(e.address!==ANCHOR.vault&&e.address!==ANCHOR.token)throw Error("Out-of-scope address");
 return e;
}
function relevant(e){
 return e.address===ANCHOR.vault||
  (e.address===ANCHOR.token&&e.topics[0]===TOPIC&&
   (e.topics[1]===PAD_VAULT||e.topics[2]===PAD_VAULT));
}
function unique(records){
 const result=new Map();
 for(const e of records){
  if(result.has(eventId(e)))throw Error("Duplicate historical log");
  result.set(eventId(e),e);
 }
 return result;
}
export function compareM37(hyperSync,quickNode){
 const a=unique(hyperSync),b=unique(quickNode),missing=[],extra=[];
 for(const [id,e] of a)if(!b.has(id)||canonical(e)!==canonical(b.get(id)))missing.push(id);
 for(const [id,e] of b)if(!a.has(id)||canonical(e)!==canonical(a.get(id)))extra.push(id);
 const t=a.get(lower(ANCHOR.knownTx)+":6");
 const d=a.get(lower(ANCHOR.knownTx)+":7");
 const value="0x"+BigInt(ANCHOR.expectedAmount).toString(16).padStart(64,"0");
 const depositMatched=!!(t&&d&&t.address===ANCHOR.token&&d.address===ANCHOR.vault&&
  t.blockNumber===ANCHOR.depositBlock&&d.blockNumber===ANCHOR.depositBlock&&
  t.topics[0]===TOPIC&&t.topics[1]===PAD_USER&&t.topics[2]===PAD_VAULT&&t.data===value&&
  d.topics[0]===DEPOSIT_TOPIC.toLowerCase()&&d.topics[1]===PAD_USER&&
  d.topics[2]===PAD_TOKEN&&d.data===value);
 const indexerSha256=sha([...a.values()]),quicknodeSha256=sha([...b.values()]);
 return {indexerCount:a.size,quicknodeCount:b.size,matchedCount:a.size-missing.length,
  missing,extra,depositMatched,indexerSha256,quicknodeSha256,
  status:missing.length===0&&extra.length===0&&depositMatched?
   "TEN_THOUSAND_BLOCK_LOGS_MATCH__FULL_HISTORY_BLOCKED":"PILOT_LOG_DIFFERENCE__BLOCKED"};
}
async function post(url,headers,body){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);
 try{
  const resp=await fetch(url,{method:"POST",headers,body:JSON.stringify(body),signal:controller.signal});
  if(!resp.ok)throw Error("Source unavailable");
  const result=await resp.json();
  if(result.error)throw Error("Provider rejected request");
  return result;
 }finally{clearTimeout(timer);}
}
export async function runM37(endpoint,envioToken,request=post){
 const out={schema:"lqc-futures-m37-ten-thousand-block-pilot-v1",status:"BLOCKED",
  chainId:97,fromBlock:FROM,toBlockExclusive:TO_EXCLUSIVE,blockCount:TO_EXCLUSIVE-FROM,
  quicknodeConfigured:validateEndpoint(endpoint).ok,hyperSyncConfigured:!!envioToken,
  requestsMade:0,maxRequests:BUDGET,quicknodeRequestsMade:0,
  estimatedFullRangeBlocks:144115367-131945040,estimatedTenThousandBlockWindows:
   Math.ceil((144115367-131945040)/10000),
  actualCreditsConsumed:null,actualDollarCost:null,
  fullHistoricalInventoryComplete:false,provenDistributableSurplus:"0",
  payoutAuthorized:false,transactionOccurred:false,signingPerformed:false,
  errors:[],comparison:null};
 if(!out.quicknodeConfigured||!out.hyperSyncConfigured){
  out.errors.push("Missing private archive endpoint or HyperSync token");
  return out;
 }
 async function bounded(url,headers,body,quicknode=false){
  if(out.requestsMade>=BUDGET)throw Error("Request budget limit");
  out.requestsMade++;
  if(quicknode)out.quicknodeRequestsMade++;
  return request(url,headers,body);
 }
 try{
  const archive=await bounded(HYPERSYNC,{"Content-Type":"application/json",Authorization:"Bearer "+envioToken},{
   from_block:FROM,to_block:TO_EXCLUSIVE,
   logs:[{address:[ANCHOR.vault]},
    {address:[ANCHOR.token],topics:[[TOPIC]]}],
   field_selection:{log:["address","block_number","transaction_hash","log_index",
    "topic0","topic1","topic2","topic3","data"]}
  });
  if(archive.next_block!==TO_EXCLUSIVE)throw Error("HyperSync range did not advance to end");
  const raw=Array.isArray(archive.data?.logs)?archive.data.logs:
   Array.isArray(archive.data)?archive.data.flatMap(v=>v.logs||[]):null;
  if(!Array.isArray(raw)||raw.length>MAX_LOGS)throw Error("Indexer log ceiling or invalid output");
  const indexed=raw.map(e=>normalize(e,true)).filter(relevant);
  const filters=[
   {address:ANCHOR.vault},
   {address:ANCHOR.token,topics:[TOPIC,null,PAD_VAULT]},
   {address:ANCHOR.token,topics:[TOPIC,PAD_VAULT]}
  ];
  const observed=[];
  for(const filter of filters){
   const json=await bounded(endpoint,{"Content-Type":"application/json"},{
    jsonrpc:"2.0",id:out.requestsMade+1,method:"eth_getLogs",params:[{
      ...filter,fromBlock:hex(FROM),toBlock:hex(TO_EXCLUSIVE-1)}]},true);
   if(!Array.isArray(json.result)||json.result.length>MAX_LOGS)
    throw Error("QuickNode invalid or oversized history");
   observed.push(...json.result.map(e=>normalize(e,false)).filter(relevant));
  }
  const dedup=new Map();
  for(const e of observed){
   const old=dedup.get(eventId(e));
   if(old&&canonical(old)!==canonical(e))throw Error("Conflicting overlapping Transfer filters");
   dedup.set(eventId(e),e);
  }
  out.comparison=compareM37(indexed,[...dedup.values()]);
  out.status=out.comparison.status;
 }catch{
  out.errors.push("Incomplete 10,000-block source read or data validation (details redacted)");
 }
 return out;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const result=await runM37(process.env.M32_QUICKNODE_BSC_TESTNET_RPC_URL,process.env.ENVIO_API_TOKEN);
 writeFileSync("futures-m37-pilot.json",JSON.stringify(result,null,2)+"\n");
 console.log(JSON.stringify(result,null,2));
}
