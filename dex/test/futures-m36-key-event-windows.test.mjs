import test from "node:test";
import assert from "node:assert/strict";
import {ethers} from "ethers";
import {compareM36,runM36} from "../scripts/verify-futures-m36-key-event-windows.mjs";
const VAULT="0xb532c65294a7b35ca510a7df025e934fa17c8d7e";
const ENGINE="0xe4f1320c8709631776c7e39e0916584935882525";
const tx="0x7a1e7681d44716fb1d662fe9a733adf3285bda5432bcbd64582b74ed5993b3c7";
const topic=ethers.id("CollateralSupportChanged(address,bool)").toLowerCase();
const a={address:VAULT,tx,blockNumber:131970723,logIndex:19,topics:[topic],data:"0x"};
const anchor={tx,index:19,contract:VAULT,topic};
test("M36 matching normalized governance log bytes and exact topic PASS with full history blocked",()=>{
 const r=compareM36([a],[{...a}],anchor);
 assert.equal(r.status,"SMALL_EVENT_WINDOW_MATCH__FULL_HISTORY_BLOCKED");
 assert.equal(r.indexerSha256,r.quicknodeSha256);
 assert.equal(r.anchored,true);
});
test("M36 same log identity but different topic is mismatch",()=>{
 const r=compareM36([a],[{...a,topics:["0x"+"cc".repeat(32)]}],anchor);
 assert.equal(r.status,"SOURCE_DIFFERENCE__BLOCKED");
 assert.equal(r.missing.length,1);
});
test("M36 one-sided missing event and unexpected event both BLOCKED",()=>{
 const miss=compareM36([a],[],anchor);
 assert.equal(miss.status,"SOURCE_DIFFERENCE__BLOCKED");
 const extra=compareM36([a],[a,{...a,tx:"0x"+"dd".repeat(32),logIndex:2}],anchor);
 assert.equal(extra.status,"SOURCE_DIFFERENCE__BLOCKED");
});
test("M36 duplicate receipt log rejected",()=>{
 assert.throws(()=>compareM36([a,a],[a],anchor),/Duplicate/);
});
test("M36 absent QuickNode credential must issue zero queries",async()=>{
 let requests=0;
 const r=await runM36(undefined,"SYNTHETIC",async()=>{requests++;return {};});
 assert.equal(r.status,"BLOCKED");assert.equal(requests,0);
 assert.equal(r.fullHistoricalInventoryComplete,false);
});
test("M36 no indexer credential must issue zero queries",async()=>{
 let requests=0;
 const r=await runM36("https://synthetic.bsc-testnet.quiknode.pro/NO_REAL_TOKEN",undefined,
   async()=>{requests++;return {};});
 assert.equal(r.status,"BLOCKED");assert.equal(requests,0);
});
test("M36 non-advancing indexer cursor blocks before QuickNode request",async()=>{
 let requests=0;
 const r=await runM36("https://synthetic.bsc-testnet.quiknode.pro/NO_REAL_TOKEN","SYNTHETIC",
   async()=>{requests++;return {next_block:131970722,data:{logs:[]}};});
 assert.equal(r.status,"BLOCKED");assert.equal(requests,1);
 assert.equal(r.windows.length,0);
});
