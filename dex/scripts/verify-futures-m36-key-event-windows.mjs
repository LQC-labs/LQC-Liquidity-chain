// 76-17-⑥-⑤ / M36 — three bounded historic event windows, HyperSync vs QuickNode.
// Read-only research. 3 windows x (1 HyperSync + 2 QuickNode) = at most 9 HTTP requests.
// No credential-bearing URLs, errors or auth tokens are written to logs or artifacts.
import {ethers} from "ethers";
import {createHash} from "node:crypto";
import {writeFileSync} from "node:fs";
import {pathToFileURL} from "node:url";
import {ANCHOR,validateEndpoint} from "./probe-futures-m32-quicknode-archive.mjs";

const ENGINE="0xe4f1320c8709631776c7e39e0916584935882525";
const HISTORY=[
 {id:"COLLATERAL_SUPPORT",at:131970723,anchor:{tx:"0x7a1e7681d44716fb1d662fe9a733adf3285bda5432bcbd64582b74ed5993b3c7",index:19,contract:ANCHOR.vault,topic:ethers.id("CollateralSupportChanged(address,bool)")}},
 {id:"POSITION_OPEN",at:131980821,anchor:{tx:"0x4cb9207fc918ee50b5895ab348d411f25258164d1ae78a0eb2f12b13071373e4",index:12,contract:ENGINE,topic:ethers.id("PositionOpened(address,uint256,bool,uint256,uint256,uint256)")}},
 {id:"POSITION_CLOSE",at:131984084,anchor:{tx:"0x4a2330fb4ac5938d2db84f360c8f7971a4c7878807a5422715493f7a2b3fee19",index:14,contract:ENGINE,topic:ethers.id("PositionClosed(address,uint256,uint256,int256)")}}
];
const QUOTA=9,MAX_EVENTS=30,ENDPOINT="https://bsc-testnet.hypersync.xyz/query";
const lower=s=>String(s??"").toLowerCase(),hex=n=>"0x"+n.toString(16);
const isHex32=s=>ethers.isHexString(s,32);
function normalize(raw,source,from,to){
 const event={address:lower(raw.address),tx:lower(source==="indexer"?raw.transaction_hash:raw.transactionHash),
  blockNumber:Number(source==="indexer"?raw.block_number:BigInt(raw.blockNumber)),
  logIndex:Number(source==="indexer"?raw.log_index:BigInt(raw.logIndex)),
  topics:(source==="indexer"?[raw.topic0,raw.topic1,raw.topic2,raw.topic3].filter(x=>x!=null):raw.topics).map(lower),
  data:lower(raw.data||"0x")};
 if(!ethers.isAddress(event.address)||!isHex32(event.tx)||
    !Number.isSafeInteger(event.blockNumber)||event.blockNumber<from||event.blockNumber>=to||
    !Number.isSafeInteger(event.logIndex)||event.logIndex<0||event.topics.length<1||
    !event.topics.every(isHex32)||!ethers.isHexString(event.data))
    throw Error("Invalid historical event");
 if(event.address!==ANCHOR.vault&&event.address!==ENGINE)throw Error("Out-of-scope contract");
 return event;
}
const eventId=e=>e.tx+":"+e.logIndex;
const serialize=e=>JSON.stringify([e.address,e.tx,e.blockNumber,e.logIndex,e.topics,e.data]);
export function compareM36(expected,observed,anchor){
 const dedup=arr=>{
  const map=new Map();
  for(const e of arr){if(map.has(eventId(e)))throw Error("Duplicate log");map.set(eventId(e),e);}
  return map;
 };
 const a=dedup(expected),b=dedup(observed);
 const missing=[],unexpected=[];
 for(const [id,event] of a)if(!b.has(id)||serialize(event)!==serialize(b.get(id)))missing.push(id);
 for(const [id,event] of b)if(!a.has(id)||serialize(event)!==serialize(a.get(id)))unexpected.push(id);
 const known=a.get(anchor.tx+":"+anchor.index);
 const anchored=!!(known&&known.address===anchor.contract&&known.topics[0]===anchor.topic);
 const digest=arr=>createHash("sha256").update(arr.map(serialize).sort().join("\n")).digest("hex");
 return {
  status:missing.length===0&&unexpected.length===0&&anchored?
    "SMALL_EVENT_WINDOW_MATCH__FULL_HISTORY_BLOCKED":"SOURCE_DIFFERENCE__BLOCKED",
  matchedCount:a.size-missing.length,indexerCount:a.size,quicknodeCount:b.size,
  anchored,missing,unexpected,indexerSha256:digest([...a.values()]),
  quicknodeSha256:digest([...b.values()])
 };
}
async function post(url,headers,body){
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),15000);
 try{
  const response=await fetch(url,{method:"POST",headers,body:JSON.stringify(body),signal:controller.signal});
  if(!response.ok)throw Error("Remote request rejected");
  const json=await response.json();
  if(json.error)throw Error("Remote RPC returned error");
  return json;
 }finally{clearTimeout(timeout);}
}
export async function runM36(endpoint,envioToken,request=post){
 const output={
  schema:"lqc-futures-m36-key-windows-v1",status:"BLOCKED",chainId:97,
  windows:[],requestsMade:0,requestBudget:QUOTA,
  quicknodeConfigured:validateEndpoint(endpoint).ok,
  hypersyncConfigured:!!envioToken,fullHistoricalInventoryComplete:false,
  provenDistributableSurplus:"0",payoutAuthorized:false,
  signingPerformed:false,transactionOccurred:false,errors:[]
 };
 if(!output.quicknodeConfigured||!output.hypersyncConfigured){
  output.errors.push("Missing/invalid private archive endpoint or indexer authorization");
  return output;
 }
 const bounded=async(url,headers,body)=>{
  if(output.requestsMade>=QUOTA)throw Error("Request limit reached");
  output.requestsMade++;
  return request(url,headers,body);
 };
 try{
  for(const selected of HISTORY){
   const from=selected.at-1,to=selected.at+2;
   const page=await bounded(ENDPOINT,{"Content-Type":"application/json",Authorization:"Bearer "+envioToken},{
    from_block:from,to_block:to,logs:[{address:[ANCHOR.vault]},{address:[ENGINE]}],
    field_selection:{log:["address","block_number","transaction_hash","log_index",
      "topic0","topic1","topic2","topic3","data"]}
   });
   if(page.next_block!==to)throw Error("Indexer coverage incomplete");
   const raw=Array.isArray(page.data?.logs)?page.data.logs:
    Array.isArray(page.data)?page.data.flatMap(x=>x.logs||[]):null;
   if(!Array.isArray(raw)||raw.length>MAX_EVENTS)throw Error("Indexer event cap exceeded");
   const indexed=raw.map(e=>normalize(e,"indexer",from,to));
   const archived=[];
   for(const address of [ANCHOR.vault,ENGINE]){
    const rpc=await bounded(endpoint,{"Content-Type":"application/json"},{
     jsonrpc:"2.0",id:output.requestsMade+1,method:"eth_getLogs",
     params:[{address,fromBlock:hex(from),toBlock:hex(to-1)}]});
    if(!Array.isArray(rpc.result)||rpc.result.length>MAX_EVENTS)throw Error("Archive event cap exceeded");
    archived.push(...rpc.result.map(e=>normalize(e,"quicknode",from,to)));
   }
   const verdict=compareM36(indexed,archived,selected.anchor);
   output.windows.push({id:selected.id,fromBlock:from,toBlockExclusive:to,
    indexerCount:verdict.indexerCount,quicknodeCount:verdict.quicknodeCount,
    matchedCount:verdict.matchedCount,anchorMatched:verdict.anchored,
    missing:verdict.missing,unexpected:verdict.unexpected,status:verdict.status,
    indexerSha256:verdict.indexerSha256,quicknodeSha256:verdict.quicknodeSha256});
   if(verdict.status!=="SMALL_EVENT_WINDOW_MATCH__FULL_HISTORY_BLOCKED")break;
  }
  output.status=output.windows.length===HISTORY.length&&output.windows.every(x=>
   x.status==="SMALL_EVENT_WINDOW_MATCH__FULL_HISTORY_BLOCKED")?
   "THREE_KEY_EVENT_WINDOWS_MATCH__FULL_HISTORY_BLOCKED":
   "INCOMPLETE_OR_DIFFERENT_EVENT_WINDOW__BLOCKED";
 }catch{
  output.errors.push("A provider query or returned event was invalid; upstream details suppressed");
 }
 return output;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const r=await runM36(process.env.M32_QUICKNODE_BSC_TESTNET_RPC_URL,process.env.ENVIO_API_TOKEN);
 writeFileSync("futures-m36-window-results.json",JSON.stringify(r,null,2)+"\n");
 console.log(JSON.stringify(r,null,2));
}
