import test from "node:test";
import assert from "node:assert/strict";
import {compareM35} from "../dex/scripts/verify-futures-m35-quicknode-hypersync-window.mjs";
import {ANCHOR,DEPOSIT_TOPIC} from "../dex/scripts/probe-futures-m32-quicknode-archive.mjs";
const padded=a=>"0x"+a.slice(2).padStart(64,"0");
const amount="0x"+BigInt(ANCHOR.expectedAmount).toString(16).padStart(64,"0");
const transferTopic="0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const base=()=>[
 {address:ANCHOR.token,blockNumber:ANCHOR.depositBlock,tx:ANCHOR.knownTx,logIndex:6,
  topics:[transferTopic,padded(ANCHOR.user),padded(ANCHOR.vault)],data:amount},
 {address:ANCHOR.vault,blockNumber:ANCHOR.depositBlock,tx:ANCHOR.knownTx,logIndex:7,
  topics:[DEPOSIT_TOPIC.toLowerCase(),padded(ANCHOR.user),padded(ANCHOR.token)],data:amount}
];
test("M35 same three-block raw records match but never authorize full history",()=>{
 const x=base(),out=compareM35(x,structuredClone(x));
 assert.equal(out.status,"THREE_BLOCK_INDEPENDENT_LOG_BYTES_MATCH__FULL_HISTORY_BLOCKED");
 assert.equal(out.indexerCount,2);assert.equal(out.matchedCount,2);
 assert.equal(out.knownDepositMatched,true);assert.equal(out.indexerSha256,out.quicknodeSha256);
});
test("M35 lost historical transfer on second provider is BLOCKED",()=>{
 const x=base(),out=compareM35(x,x.slice(1));
 assert.equal(out.status,"THREE_BLOCK_LOG_MISMATCH__BLOCKED");
 assert.equal(out.missingFromQuickNode.length,1);
});
test("M35 unexpected source log is explicitly BLOCKED",()=>{
 const x=base(),y=structuredClone(x);
 y.push({...x[1],tx:"0x"+"34".repeat(32),logIndex:3});
 const out=compareM35(x,y);
 assert.equal(out.status,"THREE_BLOCK_LOG_MISMATCH__BLOCKED");
 assert.equal(out.extraOnQuickNode.length,1);
});
test("M35 tampered raw topic bytes fail despite matching tx/log identity",()=>{
 const x=base(),y=structuredClone(x);
 y[1].topics[0]="0x"+"12".repeat(32);
 const out=compareM35(x,y);
 assert.equal(out.status,"THREE_BLOCK_LOG_MISMATCH__BLOCKED");
 assert.equal(out.missingFromQuickNode.length,1);
 assert.equal(out.extraOnQuickNode.length,1);
});
test("M35 tampered amount at both sources does not satisfy known Deposit anchor",()=>{
 const x=base();x[0].data="0x"+"00".repeat(32);
 const out=compareM35(x,structuredClone(x));
 assert.equal(out.rawBytesMatched,true);
 assert.equal(out.knownDepositMatched,false);
 assert.equal(out.status,"THREE_BLOCK_LOG_MISMATCH__BLOCKED");
});
test("M35 duplicate event identity is rejected instead of inflated count",()=>{
 const x=base();
 assert.throws(()=>compareM35([...x,x[1]],structuredClone(x)),/Duplicate/);
});
