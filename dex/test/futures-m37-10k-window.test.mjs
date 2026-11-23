import test from "node:test";
import assert from "node:assert/strict";
import {ethers} from "ethers";
import {compareM37,runM37} from "../scripts/verify-futures-m37-10k-window.mjs";
import {ANCHOR,DEPOSIT_TOPIC} from "../scripts/probe-futures-m32-quicknode-archive.mjs";
const pad=a=>ethers.zeroPadValue(a,32).toLowerCase();
const value="0x"+BigInt(ANCHOR.expectedAmount).toString(16).padStart(64,"0");
const transfer=ethers.id("Transfer(address,address,uint256)").toLowerCase();
const base=()=>[
 {address:ANCHOR.token,blockNumber:ANCHOR.depositBlock,tx:ANCHOR.knownTx,logIndex:6,
  topics:[transfer,pad(ANCHOR.user),pad(ANCHOR.vault)],data:value},
 {address:ANCHOR.vault,blockNumber:ANCHOR.depositBlock,tx:ANCHOR.knownTx,logIndex:7,
  topics:[DEPOSIT_TOPIC.toLowerCase(),pad(ANCHOR.user),pad(ANCHOR.token)],data:value}
];
const fakeEndpoint="https://synthetic.bsc-testnet.quiknode.pro/DO_NOT_USE";
test("M37 matching fixtures yield selected 10k-window PASS but full history BLOCKED",()=>{
 const logs=base(),r=compareM37(logs,structuredClone(logs));
 assert.equal(r.status,"TEN_THOUSAND_BLOCK_LOGS_MATCH__FULL_HISTORY_BLOCKED");
 assert.equal(r.matchedCount,2);
 assert.equal(r.indexerSha256,r.quicknodeSha256);
});
test("M37 missing token Transfer is BLOCKED",()=>{
 const a=base(),r=compareM37(a,a.slice(1));
 assert.equal(r.status,"PILOT_LOG_DIFFERENCE__BLOCKED");
 assert.equal(r.missing.length,1);
});
test("M37 additional remote Vault log is BLOCKED",()=>{
 const a=base(),b=structuredClone(a);
 b.push({...a[1],tx:"0x"+"aa".repeat(32),logIndex:19});
 const r=compareM37(a,b);
 assert.equal(r.status,"PILOT_LOG_DIFFERENCE__BLOCKED");
 assert.equal(r.extra.length,1);
});
test("M37 matching event ID with changed data is BLOCKED",()=>{
 const a=base(),b=structuredClone(a);b[1].data="0x"+"00".repeat(32);
 const r=compareM37(a,b);
 assert.equal(r.status,"PILOT_LOG_DIFFERENCE__BLOCKED");
 assert.equal(r.missing.length,1);assert.equal(r.extra.length,1);
});
test("M37 same forged amount on both providers still fails M08 deposit anchor",()=>{
 const a=base();a[0].data="0x"+"00".repeat(32);
 const r=compareM37(a,structuredClone(a));
 assert.equal(r.status,"PILOT_LOG_DIFFERENCE__BLOCKED");
 assert.equal(r.depositMatched,false);
});
test("M37 duplicate indexed event cannot inflate match",()=>{
 const a=base();
 assert.throws(()=>compareM37([...a,a[0]],a),/Duplicate/);
});
test("M37 missing QuickNode secret causes ZERO network calls",async()=>{
 let requests=0;
 const r=await runM37(undefined,"SYNTHETIC",async()=>{requests++;return {};});
 assert.equal(requests,0);assert.equal(r.status,"BLOCKED");
 assert.equal(r.fullHistoricalInventoryComplete,false);
});
test("M37 missing HyperSync token causes ZERO network calls",async()=>{
 let requests=0;
 const r=await runM37(fakeEndpoint,undefined,async()=>{requests++;return {};});
 assert.equal(requests,0);assert.equal(r.status,"BLOCKED");
});
test("M37 indexer pagination gap prevents any archive requests",async()=>{
 let requests=0;
 const r=await runM37(fakeEndpoint,"SYNTHETIC",async()=>{requests++;return {next_block:131980000,data:{logs:[]}};});
 assert.equal(requests,1);assert.equal(r.status,"BLOCKED");
 assert.equal(r.quicknodeRequestsMade,0);
});
