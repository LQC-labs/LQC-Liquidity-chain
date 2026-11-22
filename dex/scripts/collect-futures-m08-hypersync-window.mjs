// 76-17-⑥-⑤ / M08 — bounded HyperSync Engine/Vault event pilot, read-only.
// Never signs, sends transactions, or declares historical inventory complete.
import { writeFileSync } from "node:fs";
import { ethers } from "ethers";

const BASE="https://bsc-testnet.hypersync.xyz";
const ENGINE="0xe4f1320c8709631776c7e39e0916584935882525";
const VAULT="0xb532c65294a7b35ca510a7df025e934fa17c8d7e";
const FROM=131945356, TO=132000000; // exclusive; bounded historical pilot, not the full chain.
const MAX_PAGES=6;
const OPEN_TX="0x4cb9207fc918ee50b5895ab348d411f25258164d1ae78a0eb2f12b13071373e4";
const CLOSE_TX="0x4a2330fb4ac5938d2db84f360c8f7971a4c7878807a5422715493f7a2b3fee19";
const iface=new ethers.Interface([
  "event PositionOpened(address indexed account,uint256 indexed marketId,bool isLong,uint256 margin,uint256 sizeUsd,uint256 entryPrice)",
  "event PositionClosed(address indexed account,uint256 indexed marketId,uint256 exitPrice,int256 pnl)",
  "event PositionLiquidated(address indexed account,uint256 indexed marketId,address indexed liquidator,uint256 price,int256 pnl)",
  "event Deposit(address indexed account,address indexed token,uint256 amount)",
  "event Withdrawal(address indexed account,address indexed token,uint256 amount)",
  "event CollateralLocked(address indexed account,address indexed token,uint256 amount)",
  "event CollateralUnlocked(address indexed account,address indexed token,uint256 amount)"
]);
const allowed={
  [ENGINE]:new Set(["PositionOpened","PositionClosed","PositionLiquidated"]),
  [VAULT]:new Set(["Deposit","Withdrawal","CollateralLocked","CollateralUnlocked"])
};
const report={schema:"lqc-m08-hypersync-bounded-pilot-v1",chainId:97,fromBlock:FROM,
  toBlockExclusive:TO,endpoint:BASE,status:"BLOCKED",coverageComplete:false,
  fullHistoricalInventoryComplete:false,operationalCutoverAuthorized:false,
  signingPerformed:false,transactionOccurred:false,pages:[],events:[],accounts:[]};
function errText(error){
  return String(error?.message||error).replaceAll(process.env.ENVIO_API_TOKEN||"__MISSING_TOKEN__","[REDACTED]").slice(0,300);
}
async function query(from){
  const token=process.env.ENVIO_API_TOKEN;
  if(!token) throw Error("ENVIO_API_TOKEN not configured");
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),20000);
  try{
    const request={from_block:from,to_block:TO,
      logs:[{address:[ENGINE,VAULT]}],
      field_selection:{log:["address","block_number","transaction_hash","log_index",
        "topic0","topic1","topic2","topic3","data"]}};
    const response=await fetch(BASE+"/query",{method:"POST",signal:controller.signal,
      headers:{"Content-Type":"application/json","Authorization":"Bearer "+token},
      body:JSON.stringify(request)});
    if(!response.ok)throw Error("HyperSync HTTP "+response.status);
    return await response.json();
  }finally{clearTimeout(timer);}
}
try{
  let cursor=FROM;
  const ids=new Set(),accounts=new Set();
  for(let page=0;page<MAX_PAGES&&cursor<TO;page++){
    const payload=await query(cursor);
    const next=payload?.next_block;
    if(!Number.isSafeInteger(next)||next<=cursor||next>TO)throw Error("nonadvancing/invalid next_block");
    if(payload?.archive_height!==undefined && Number(payload.archive_height)<next)
      throw Error("archive not caught up to page");
    const raw=payload?.data;
    const logs=Array.isArray(raw?.logs)?raw.logs :
      Array.isArray(raw)?raw.flatMap(v=>v?.logs||[]):null;
    if(!Array.isArray(logs))throw Error("missing logs array");
    let count=0;
    for(const log of logs){
      const addr=String(log.address||"").toLowerCase();
      const block=Number(log.block_number),index=Number(log.log_index);
      const tx=String(log.transaction_hash||"").toLowerCase();
      if(!allowed[addr]||!Number.isSafeInteger(block)||block<cursor||block>=next||
         !Number.isSafeInteger(index)||!/^(0x)[0-9a-f]{64}$/.test(tx))throw Error("invalid log identity/range");
      const key=tx+":"+index;
      if(ids.has(key))throw Error("duplicate log identity");
      ids.add(key);
      const topics=[log.topic0,log.topic1,log.topic2,log.topic3].filter(x=>x!=null);
      const parsed=iface.parseLog({topics,data:log.data||"0x"});
      if(!parsed||!allowed[addr].has(parsed.name))throw Error("unexpected historical event");
      const account=String(parsed.args.account||"").toLowerCase();
      if(!ethers.isAddress(account))throw Error("invalid account in event");
      accounts.add(account);
      report.events.push({contract:addr===ENGINE?"Engine":"Vault",name:parsed.name,
        blockNumber:block,transactionHash:tx,logIndex:index,account,
        marketId:addr===ENGINE?parsed.args.marketId.toString():null});
      count++;
    }
    report.pages.push({from:cursor,toExclusive:next,logCount:count,completed:true,truncated:false});
    cursor=next;
  }
  report.scannedThroughExclusive=cursor;
  report.accounts=[...accounts].sort();
  report.eventsFound=report.events.length;
  report.firstOpenPresent=report.events.some(x=>x.transactionHash===OPEN_TX&&x.name==="PositionOpened");
  report.firstClosePresent=report.events.some(x=>x.transactionHash===CLOSE_TX&&x.name==="PositionClosed");
  report.coverageComplete=cursor===TO;
  report.status=report.coverageComplete && report.firstOpenPresent && report.firstClosePresent ?
    "BOUNDED_WINDOW_EVIDENCE_PASS":"BLOCKED";
  report.reason=report.status==="BOUNDED_WINDOW_EVIDENCE_PASS"?
    "Only the bounded historical window is covered; full account inventory remains BLOCKED.":
    "Page cap, history gap, or known historical opening/closure event not confirmed.";
}catch(error){report.status="BLOCKED";report.reason=errText(error);}
writeFileSync("futures-m08-hypersync-window.json",JSON.stringify(report,null,2)+"\n");
console.log(JSON.stringify({status:report.status,reason:report.reason,pages:report.pages.length,
  scannedThroughExclusive:report.scannedThroughExclusive,eventsFound:report.eventsFound,
  accountsFound:report.accounts.length,firstOpenPresent:report.firstOpenPresent,
  firstClosePresent:report.firstClosePresent,fullHistoricalInventoryComplete:false},null,2));
