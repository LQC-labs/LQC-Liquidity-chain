// M08 HyperSync one-block provider capability probe — NO bulk scan.
// Requires ENVIO_API_TOKEN for /query. Never prints secrets or signs transactions.
import { writeFileSync } from "node:fs";
const BASE="https://bsc-testnet.hypersync.xyz";
const ENGINE="0xe4f1320c8709631776c7e39e0916584935882525";
const FROM=131980821;
const EXPECTED_TX="0x4cb9207fc918ee50b5895ab348d411f25258164d1ae78a0eb2f12b13071373e4";
const report={schema:"lqc-futures-m08-hypersync-capability-v1",chainId:97,
  fromBlock:FROM,toBlockExclusive:FROM+1,endpoint:BASE,
  tokenPresent:!!process.env.ENVIO_API_TOKEN,status:"BLOCKED",
  operationalCutoverAuthorized:false,inventoryComplete:false,
  signingPerformed:false,transactionOccurred:false};
async function request(url, options={}) {
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),12000);
  try {
    const response=await fetch(url,{...options,signal:controller.signal});
    const body=await response.text();
    return {status:response.status,data:body?JSON.parse(body):null};
  } finally {clearTimeout(timeout);}
}
try {
  const height=await request(BASE+"/height");
  report.heightHttpStatus=height.status;
  if(height.status!==200 || !Number.isSafeInteger(height.data?.height) || height.data.height<=FROM)
    throw Error("HyperSync height is unavailable or older than documented position");
  report.indexedHeight=height.data.height;
  if(!process.env.ENVIO_API_TOKEN){
    report.reason="ENVIO_API_TOKEN required for indexed /query. No query attempted.";
  } else {
    const query={from_block:FROM,to_block:FROM+1,
      logs:[{address:[ENGINE]}],
      field_selection:{log:["address","block_number","transaction_hash","log_index","topic0","topic1","topic2","data"]}};
    const res=await request(BASE+"/query",{method:"POST",
      headers:{"Content-Type":"application/json","Authorization":"Bearer "+process.env.ENVIO_API_TOKEN},
      body:JSON.stringify(query)});
    report.queryHttpStatus=res.status;
    if(res.status!==200) throw Error("indexed /query rejected request (HTTP "+res.status+")");
    if(!Number.isSafeInteger(res.data?.next_block) || res.data.next_block<=FROM)
      throw Error("indexed /query did not provide advancing next_block");
    const logs=(res.data.data||[]).flatMap(x=>x.logs||[]);
    report.observedLogCount=logs.length;
    report.knownFirstPositionTransactionPresent=logs.some(l=>
      (l.transaction_hash||"").toLowerCase()===EXPECTED_TX &&
      (l.address||"").toLowerCase()===ENGINE);
    if(!report.knownFirstPositionTransactionPresent)
      throw Error("known historical PositionOpened transaction absent from indexed single-block response");
    report.status="PROVIDER_CAPABILITY_PASS";
    report.reason="Single historical block is retrievable. Full historical coverage is NOT verified.";
  }
} catch(err) {
  report.status="BLOCKED";
  report.reason=String(err?.message||err).slice(0,350);
}
writeFileSync("futures-m08-hypersync-capability.json",JSON.stringify(report,null,2)+"\n");
console.log(JSON.stringify(report,null,2));
