import test from "node:test";
import assert from "node:assert/strict";
import {ANCHOR,DEPOSIT_TOPIC,probeM32,validateEndpoint} from "../dex/scripts/probe-futures-m32-quicknode-archive.mjs";

const ep="https://synthetic-testnet.bsc.quiknode.pro/TEST_KEY_DO_NOT_SEND";
const pad=a=>"0x"+a.slice(2).padStart(64,"0");
const hex=n=>"0x"+BigInt(n).toString(16);
function receipt(){
 return {status:"0x1",blockNumber:hex(ANCHOR.depositBlock),blockHash:ANCHOR.depositBlockHash,logs:[
  {logIndex:"0x6",address:ANCHOR.token,topics:[
   "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
   pad(ANCHOR.user),pad(ANCHOR.vault)],
   data:pad("0x"+BigInt(ANCHOR.expectedAmount).toString(16))},
  {logIndex:"0x7",address:ANCHOR.vault,
   topics:[DEPOSIT_TOPIC,pad(ANCHOR.user),pad(ANCHOR.token)],
   data:pad("0x"+BigInt(ANCHOR.expectedAmount).toString(16))}
 ]};
}
function fake(override={}){
 const count={n:0};
 const responses={
  eth_chainId:"0x61",
  eth_getBlockByNumber:{hash:ANCHOR.snapshotHash},
  eth_getTransactionReceipt:receipt(),
  eth_getLogs:[{transactionHash:ANCHOR.knownTx,logIndex:"0x7",address:ANCHOR.vault,
   blockHash:ANCHOR.depositBlockHash,blockNumber:hex(ANCHOR.depositBlock),
   topics:[DEPOSIT_TOPIC,pad(ANCHOR.user),pad(ANCHOR.token)],
   data:pad("0x"+BigInt(ANCHOR.expectedAmount).toString(16))}],
  eth_call:pad("0x"+BigInt(ANCHOR.expectedAmount).toString(16)),...override
 };
 return {count,request:async(method,params)=>{count.n++;return responses[method];}};
}
test("M32 no endpoint is BLOCKED and issues zero remote calls",async()=>{
 const f=fake(),r=await probeM32(undefined,f.request);
 assert.equal(r.status,"BLOCKED");assert.equal(f.count.n,0);
 assert.equal(r.payoutAuthorized,false);
});
test("M32 reject non-QuickNode and query-parameter credentials before any request",async()=>{
 for(const endpoint of ["http://x.quiknode.pro/a","https://evil.com/a",
  "https://foo.quiknode.pro/a?token=secret","https://foo.quiknode.pro/",
  "https://foo.quiknode.pro:9999/a"]){
  const f=fake(),r=await probeM32(endpoint,f.request);
  assert.equal(r.status,"BLOCKED");assert.equal(f.count.n,0);
 }
});
test("M32 bounded historical capability fixture PASS means full-range BLOCKED",async()=>{
 const f=fake(),r=await probeM32(ep,f.request);
 assert.equal(r.status,"SMALL_READ_ONLY_ARCHIVE_PROBE_PASS__FULL_HISTORY_BLOCKED");
 assert.equal(f.count.n,5);
 assert.equal(r.checks.length,5);
 assert.equal(r.archiveStateAvailable,true);
 assert.equal(r.fullHistoricalInventoryComplete,false);
 assert.equal(r.provenDistributableSurplus,"0");
});
test("M32 wrong chain stops before receipts and logs",async()=>{
 const f=fake({eth_chainId:"0x38"}),r=await probeM32(ep,f.request);
 assert.equal(r.status,"BLOCKED");assert.equal(f.count.n,1);
});
test("M32 wrong pinned block stops before receipts",async()=>{
 const f=fake({eth_getBlockByNumber:{hash:"0x"+"00".repeat(32)}}),r=await probeM32(ep,f.request);
 assert.equal(r.status,"BLOCKED");assert.equal(f.count.n,2);
});
test("M32 tampered transfer amount or missing receipt does not pass",async()=>{
 for(const changed of [undefined,{...receipt(),logs:receipt().logs.map(x=>({...x,data:"0x"+"00".repeat(32)}))}]){
  const f=fake({eth_getTransactionReceipt:changed}),r=await probeM32(ep,f.request);
  assert.equal(r.status,"BLOCKED");assert.equal(f.count.n,3);
 }
});
test("M32 unavailable single-block logs stops before expensive historical state",async()=>{
 const f=fake({eth_getLogs:[]}),r=await probeM32(ep,f.request);
 assert.equal(r.status,"BLOCKED");assert.equal(f.count.n,4);
});
test("M32 missing historical trie or wrong balance remains BLOCKED",async()=>{
 const f=fake({eth_call:"0x"+"00".repeat(32)}),r=await probeM32(ep,f.request);
 assert.equal(r.status,"BLOCKED");assert.equal(f.count.n,5);
 const g=fake(),error=async(method,params)=>{
  if(method==="eth_call")throw Error("SENSITIVE_AUTH_VALUE");
  return g.request(method,params);
 };
 const p=await probeM32(ep,error);
 assert.equal(p.status,"BLOCKED");assert.ok(!JSON.stringify(p).includes("SENSITIVE_AUTH_VALUE"));
});


test("M33 reject fake Deposit topic0 even if indexed account token and amount match",async()=>{
 const fakeReceipt=receipt();
 fakeReceipt.logs[1].topics[0]="0x"+"ab".repeat(32);
 const f=fake({eth_getTransactionReceipt:fakeReceipt});
 const r=await probeM32(ep,f.request);
 assert.equal(r.status,"BLOCKED");
 assert.equal(f.count.n,3);
 assert.equal(r.knownReceiptMatches,false);
});
test("M33 reject receipt from a different historical block hash",async()=>{
 const altered={...receipt(),blockHash:"0x"+"12".repeat(32)};
 const f=fake({eth_getTransactionReceipt:altered});
 const r=await probeM32(ep,f.request);
 assert.equal(r.status,"BLOCKED");
 assert.equal(f.count.n,3);
});
test("M33 reject mismatched one-block Vault log even after valid known receipt",async()=>{
 const bad=fake().request;
 const item={transactionHash:ANCHOR.knownTx,logIndex:"0x7",
  address:ANCHOR.vault,blockHash:ANCHOR.depositBlockHash,blockNumber:hex(ANCHOR.depositBlock),
  topics:["0x"+"12".repeat(32),pad(ANCHOR.user),pad(ANCHOR.token)],
  data:pad("0x"+BigInt(ANCHOR.expectedAmount).toString(16))};
 const f=fake({eth_getLogs:[item]});
 const r=await probeM32(ep,f.request);
 assert.equal(r.status,"BLOCKED");assert.equal(f.count.n,4);
 assert.equal(r.oneBlockLogsAvailable,false);
});
