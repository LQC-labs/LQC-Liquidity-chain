// 76-17-⑥-⑤ / M35 — bounded HyperSync vs QuickNode historical EVENT-BYTES comparison.
// Scope: only three blocks around M08 known Deposit. Read-only, 4 outbound requests at most.
// Never logs bearer tokens, QuickNode URL, network errors, or RPC auth headers.
import {ethers} from "ethers";
import {createHash} from "node:crypto";
import {writeFileSync} from "node:fs";
import {pathToFileURL} from "node:url";
import {ANCHOR,validateEndpoint,DEPOSIT_TOPIC} from "./probe-futures-m32-quicknode-archive.mjs";

const FROM=ANCHOR.depositBlock-1,TO=ANCHOR.depositBlock+2; // end-exclusive
const HYPERSYNC="https://bsc-testnet.hypersync.xyz/query";
const transferTopic=ethers.id("Transfer(address,address,uint256)");
const paddedVault=ethers.zeroPadValue(ANCHOR.vault,32);
const hex=n=>"0x"+n.toString(16);
const lower=x=>String(x??"").toLowerCase();
function entry(log,origin){
 const address=lower(log.address);
 const blockNumber=Number(origin==="hypersync"?log.block_number:BigInt(log.blockNumber));
 const logIndex=Number(origin==="hypersync"?log.log_index:BigInt(log.logIndex));
 const tx=lower(origin==="hypersync"?log.transaction_hash:log.transactionHash);
 const topics=(origin==="hypersync"?[log.topic0,log.topic1,log.topic2,log.topic3].filter(x=>x!=null):log.topics).map(lower);
 const data=lower(log.data||"0x");
 if(!ethers.isAddress(address)||!ethers.isHexString(tx,32)||
  !Number.isSafeInteger(blockNumber)||blockNumber<FROM||blockNumber>=TO||
  !Number.isSafeInteger(logIndex)||logIndex<0||!topics.length||
  !topics.every(t=>ethers.isHexString(t,32))||!ethers.isHexString(data))
  throw Error("Malformed historical log record");
 return {address,blockNumber,tx,logIndex,topics,data};
}
function signature(e){return JSON.stringify([e.address,e.blockNumber,e.tx,e.logIndex,e.topics,e.data]);}
export function compareM35(indexer,quicknode){
 const out={status:"BLOCKED",indexerCount:0,quicknodeCount:0,
  matchedCount:0,missingFromQuickNode:[],extraOnQuickNode:[],
  rawBytesMatched:false,knownDepositMatched:false,comparable:false};
 const dedup=arr=>{
  const keys=new Set();
  return arr.map(e=>{
   const key=e.tx+":"+e.logIndex;
   if(keys.has(key))throw Error("Duplicate log identity");
   keys.add(key);
   return e;
  });
 };
 const a=dedup(indexer),b=dedup(quicknode);
 out.indexerCount=a.length;out.quicknodeCount=b.length;
 const idx=new Map(a.map(e=>[e.tx+":"+e.logIndex,e]));
 const rpc=new Map(b.map(e=>[e.tx+":"+e.logIndex,e]));
 for(const [id,ev] of idx){
  const other=rpc.get(id);
  if(!other||signature(ev)!==signature(other))out.missingFromQuickNode.push(id);
  else out.matchedCount++;
 }
 for(const [id,ev] of rpc){
  const other=idx.get(id);
  if(!other||signature(ev)!==signature(other))out.extraOnQuickNode.push(id);
 }
 out.rawBytesMatched=out.missingFromQuickNode.length===0&&out.extraOnQuickNode.length===0;
 const expectedTokenKey=lower(ANCHOR.knownTx)+":6";
 const expectedDepositKey=lower(ANCHOR.knownTx)+":7";
 const t=idx.get(expectedTokenKey),d=idx.get(expectedDepositKey);
 const value="0x"+BigInt(ANCHOR.expectedAmount).toString(16).padStart(64,"0");
 out.knownDepositMatched=!!(t&&d&&
  t.address===ANCHOR.token&&t.blockNumber===ANCHOR.depositBlock&&
  t.topics[0]===transferTopic&&t.topics[1]===ethers.zeroPadValue(ANCHOR.user,32).toLowerCase()&&
  t.topics[2]===paddedVault.toLowerCase()&&t.data===value&&
  d.address===ANCHOR.vault&&d.blockNumber===ANCHOR.depositBlock&&
  d.topics[0]===DEPOSIT_TOPIC.toLowerCase()&&
  d.topics[1]===ethers.zeroPadValue(ANCHOR.user,32).toLowerCase()&&
  d.topics[2]===ethers.zeroPadValue(ANCHOR.token,32).toLowerCase()&&d.data===value);
 out.comparable=true;
 out.status=out.rawBytesMatched&&out.knownDepositMatched?
  "THREE_BLOCK_INDEPENDENT_LOG_BYTES_MATCH__FULL_HISTORY_BLOCKED":
  "THREE_BLOCK_LOG_MISMATCH__BLOCKED";
 const canonical=a.map(signature).sort().join("\n");
 out.indexerSha256=createHash("sha256").update(canonical).digest("hex");
 out.quicknodeSha256=createHash("sha256").update(b.map(signature).sort().join("\n")).digest("hex");
 return out;
}
function base(){
 return {schema:"lqc-m35-small-window-archive-crosscheck-v1",status:"BLOCKED",
  network:"BSC Testnet",chainId:97,fromBlock:FROM,toBlockExclusive:TO,
  windowBlocks:3,quicknodeConfigured:false,hyperSyncTokenConfigured:false,
  independentWindowComplete:false,queryBudget:4,requestsMade:0,
  loggedCredentials:false,fullHistoricalInventoryComplete:false,provenDistributableSurplus:"0",
  oldUserClaimPreservedFromM08:true,payoutAuthorized:false,signingPerformed:false,
  transactionOccurred:false,errors:[],crosscheck:null};
}
async function post(url,headers,body){
 const c=new AbortController(),t=setTimeout(()=>c.abort(),13000);
 try{
  const r=await fetch(url,{method:"POST",headers,body:JSON.stringify(body),signal:c.signal});
  if(!r.ok)throw Error("External provider response unavailable");
  const payload=await r.json();
  if(payload.error)throw Error("External provider rejected request");
  return payload;
 }finally{clearTimeout(t);}
}
async function main(){
 const out=base();
 const endpoint=process.env.M32_QUICKNODE_BSC_TESTNET_RPC_URL;
 const token=process.env.ENVIO_API_TOKEN;
 out.quicknodeConfigured=validateEndpoint(endpoint).ok;
 out.hyperSyncTokenConfigured=!!token;
 if(!out.quicknodeConfigured||!out.hyperSyncTokenConfigured){
  out.errors.push("A required private endpoint or indexer secret is missing or invalid");
  return out;
 }
 const request=async(url,headers,body)=>{
  if(out.requestsMade>=out.queryBudget)throw Error("Request budget exhausted");
  out.requestsMade++;
  return post(url,headers,body);
 };
 try{
  const q=await request(HYPERSYNC,{"Content-Type":"application/json",Authorization:"Bearer "+token},{
   from_block:FROM,to_block:TO,logs:[
    {address:[ANCHOR.vault]},
    {address:[ANCHOR.token],topics:[[transferTopic]]}
   ],field_selection:{log:["address","block_number","transaction_hash","log_index","topic0","topic1","topic2","topic3","data"]}
  });
  if(q.next_block!==TO)throw Error("Indexer did not cover full three-block window");
  const raw=Array.isArray(q.data?.logs)?q.data.logs:
   Array.isArray(q.data)?q.data.flatMap(x=>x.logs||[]):null;
  if(!Array.isArray(raw)||raw.length>50)throw Error("Indexer log count invalid");
  const indexer=raw.map(l=>entry(l,"hypersync")).filter(x=>
   x.address===ANCHOR.vault || (x.address===ANCHOR.token&&
   x.topics[0]===transferTopic&&
   (x.topics[1]===paddedVault.toLowerCase()||x.topics[2]===paddedVault.toLowerCase())));
  const rpcQuery=async(filter)=>{
   const id=out.requestsMade+1;
   const json=await request(endpoint,{"Content-Type":"application/json"},
    {jsonrpc:"2.0",id,method:"eth_getLogs",params:[{...filter,fromBlock:hex(FROM),toBlock:hex(TO-1)}]});
   if(!Array.isArray(json.result)||json.result.length>50)throw Error("Archive logs unavailable");
   return json.result.map(l=>entry(l,"quicknode"));
  };
  const vault=await rpcQuery({address:ANCHOR.vault});
  const incoming=await rpcQuery({address:ANCHOR.token,topics:[transferTopic,null,paddedVault]});
  const outgoing=await rpcQuery({address:ANCHOR.token,topics:[transferTopic,paddedVault]});
  const all=[...vault,...incoming,...outgoing];
  // Do not double-count token self-transfers that match both endpoint filters.
  const once=new Map();
  for(const e of all)once.set(e.tx+":"+e.logIndex,e);
  out.crosscheck=compareM35(indexer,[...once.values()]);
  out.independentWindowComplete=out.crosscheck.status==="THREE_BLOCK_INDEPENDENT_LOG_BYTES_MATCH__FULL_HISTORY_BLOCKED";
  out.status=out.independentWindowComplete?
   "THREE_BLOCK_INDEPENDENT_LOG_BYTES_MATCH__FULL_HISTORY_BLOCKED":
   "THREE_BLOCK_SOURCE_DIFFERENCE__BLOCKED";
 }catch{
  // Always redact raw upstream text (which can include HTTP headers or secret URLs).
  out.errors.push("Source request failed or returned incomplete/malformed data (details redacted)");
 }
 return out;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const result=await main();
 writeFileSync("futures-m35-small-window.json",JSON.stringify(result,null,2)+"\n");
 console.log(JSON.stringify(result,null,2));
}
