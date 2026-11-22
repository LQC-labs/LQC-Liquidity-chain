import test from "node:test";
import assert from "node:assert/strict";
import {reviewM31} from "../scripts/verify-futures-m31-archive-export.mjs";
const START=131945040,END=144115366;
const VAULT="0xb532c65294a7b35ca510a7df025e934fa17c8d7e";
const TOKEN="0x7ab1b97d194730e9456c12af7905450a4f8a0c46";
const USER="0xde05e09db1292aff6ab62164134f1ad384bca6fb";
const ids=[
 ["0x263e7d9135a646caa958e3a317867a13f056e0c712ddd9429d9b432a2d45cda0",7,"OwnershipTransferred",131945040],
 ["0x7ed4a0789aa89b091919e82b32c52b04d5ac3d1c17754c5db115877b1262cff5",13,"EngineChanged",131970722],
 ["0x7a1e7681d44716fb1d662fe9a733adf3285bda5432bcbd64582b74ed5993b3c7",19,"CollateralSupportChanged",131970723],
 ["0x00a756b77545a0ddc732f424f81c179c7d71119427108a50a1e43fa56be988f1",7,"Deposit",131978250],
 ["0x4cb9207fc918ee50b5895ab348d411f25258164d1ae78a0eb2f12b13071373e4",11,"CollateralLocked",131980821],
 ["0x4a2330fb4ac5938d2db84f360c8f7971a4c7878807a5422715493f7a2b3fee19",13,"CollateralUnlocked",131984084]
];
function fixture(){
 const logs=ids.map(([tx,logIndex,name,blockNumber])=>({tx,logIndex,name,blockNumber,address:VAULT}));
 logs[3].account=USER;logs[3].token=TOKEN;logs[3].amount="5000000000000000000000";
 const transfer={tx:ids[3][0],logIndex:6,name:"Transfer",blockNumber:131978250,
   address:TOKEN,from:USER,to:VAULT,amount:"5000000000000000000000"};
 return {schema:"lqc-m31-archive-log-export-v1",chainId:97,fromBlock:START,toBlockInclusive:END,
  snapshotHash:"0x7a0d76a80ecc8b13d9eb7e2f1c7a5e3f96f16d3233d8d02c3f842c95a07d6208",
  vault:VAULT,token:TOKEN,
  streams:[
   {kind:"vault",ranges:[{from:START,to:END,success:true,logs}]},
   {kind:"token_out",ranges:[{from:START,to:END,success:true,logs:[]}]},
   {kind:"token_in",ranges:[{from:START,to:END,success:true,logs:[transfer]}]}
  ]};
}
const clone=()=>structuredClone(fixture());
test("M31 matching synthetic complete range is format match only, never independent provenance",()=>{
 const r=reviewM31(clone());
 assert.equal(r.status,"INDEPENDENT_EXPORT_FORMAT_AND_EVENT_SET_MATCH__AUTHENTICITY_BLOCKED");
 assert.equal(r.expectedKnownEventsMatched,7);
 assert.equal(r.formatRangeComplete,true);
 assert.equal(r.independentProviderProven,false);
 assert.equal(r.payoutAuthorized,false);
 assert.equal(r.spendableProtocolSurplus,"0");
});
test("M31 truncated range or failed response is FAIL not zero-log proof",()=>{
 for(const patch of [{success:false},{truncated:true},{error:"archive missing"}]){
  const f=clone();Object.assign(f.streams[1].ranges[0],patch);
  assert.equal(reviewM31(f).status,"FAIL");
 }
});
test("M31 missing range is incomplete",()=>{
 const f=clone();f.streams[2].ranges[0].to=END-1;
 const r=reviewM31(f);
 assert.equal(r.status,"INCOMPLETE_OR_DIVERGENT_ARCHIVE_EXPORT__BLOCKED");
 assert.equal(r.formatRangeComplete,false);
});
test("M31 omitted independent token transfer is not PASS",()=>{
 const f=clone();f.streams[2].ranges[0].logs=[];
 const r=reviewM31(f);assert.equal(r.expectedKnownEventsMatched,6);
 assert.equal(r.status,"INCOMPLETE_OR_DIVERGENT_ARCHIVE_EXPORT__BLOCKED");
});
test("M31 unexpected ERC20 log is not silently accepted",()=>{
 const f=clone();f.streams[2].ranges[0].logs.push({
  tx:"0x"+"ee".repeat(32),logIndex:0,name:"Transfer",blockNumber:131980000,
  address:TOKEN,from:USER,to:VAULT,amount:"1"});
 const r=reviewM31(f);assert.equal(r.unexpectedIds.length,1);
 assert.equal(r.status,"INCOMPLETE_OR_DIVERGENT_ARCHIVE_EXPORT__BLOCKED");
});
test("M31 duplicate log identity across filters FAIL",()=>{
 const f=clone();f.streams[1].ranges[0].logs.push({...f.streams[2].ranges[0].logs[0]});
 assert.equal(reviewM31(f).status,"FAIL");
});
test("M31 misreported deposit amount, chain and hash FAIL",()=>{
 const changes=[
  f=>f.streams[0].ranges[0].logs[3].amount="1",
  f=>f.streams[2].ranges[0].logs[0].amount="1",
  f=>f.chainId=56,
  f=>f.snapshotHash="0x"+"aa".repeat(32)
 ];
 for(const change of changes){const f=clone();change(f);assert.equal(reviewM31(f).status,"FAIL");}
});
test("M31 overlapping or unsorted ranges FAIL",()=>{
 const f=clone();
 f.streams[0].ranges=[
  {from:START,to:131980000,success:true,logs:f.streams[0].ranges[0].logs.slice(0,4)},
  {from:131980000,to:END,success:true,logs:f.streams[0].ranges[0].logs.slice(4)}
 ];
 assert.equal(reviewM31(f).status,"FAIL");
});
