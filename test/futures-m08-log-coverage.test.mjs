import test from "node:test";
import assert from "node:assert/strict";
import { verifyM08Coverage } from "../scripts/verify-futures-m08-log-coverage.mjs";
const H="0x"+"ab".repeat(32);
const TX="0x"+"cd".repeat(32);
const A="0x"+"ef".repeat(20);
function fixture(){
  return {schema:"lqc-m08-coverage-v1",chainId:97,snapshotBlock:20,snapshotHash:H,
    independentProvenanceVerified:false,
    coverages:[
      {contract:"engine",address:"0xe4f1320c8709631776c7e39e0916584935882525",
       deploymentBlock:10,snapshotBlock:20,snapshotHash:H,
       ranges:[{from:10,to:15,source:"synthetic-source",completed:true,truncated:false,logCount:1},
               {from:16,to:20,source:"synthetic-source",completed:true,truncated:false,logCount:0}]},
      {contract:"vault",address:"0xb532c65294a7b35ca510a7df025e934fa17c8d7e",
       deploymentBlock:12,snapshotBlock:20,snapshotHash:H,
       ranges:[{from:12,to:20,source:"synthetic-source",completed:true,truncated:false,logCount:0}]}
    ],
    events:[{contract:"engine",eventName:"PositionOpened",blockNumber:11,transactionHash:TX,
      logIndex:0,account:A,marketId:1}]};
}
const copy=()=>structuredClone(fixture());
test("M08 contiguous ranges yield format PASS, never inventory/operational approval",()=>{
  const r=verifyM08Coverage(copy());
  assert.equal(r.status,"COVERAGE_FORMAT_PASS");
  assert.equal(r.inventoryComplete,false);
  assert.equal(r.operationalCutoverAuthorized,false);
  assert.equal(r.discoveredAccounts.length,1);
});
test("M08 missing gap is BLOCKED",()=>{
  const f=copy();f.coverages[0].ranges[1].from=17;
  const r=verifyM08Coverage(f);
  assert.equal(r.status,"BLOCKED");
  assert.deepEqual(r.gaps[0],{contract:"engine",from:16,to:16,reason:"unscanned"});
});
test("M08 incomplete, truncated or RPC-error range is BLOCKED",()=>{
  for(const patch of [{completed:false},{truncated:true},{rpcError:"range limit"}]){
    const f=copy();Object.assign(f.coverages[1].ranges[0],patch);
    assert.equal(verifyM08Coverage(f).status,"BLOCKED");
  }
});
test("M08 overlap is FAIL",()=>{
  const f=copy();f.coverages[0].ranges[1].from=15;
  assert.equal(verifyM08Coverage(f).status,"FAIL");
});
test("M08 wrong chain/address/hash or inconsistent snapshot fails",()=>{
  const variants=[
    f=>f.chainId=56,
    f=>f.coverages[0].address="0x"+"11".repeat(20),
    f=>f.coverages[1].snapshotHash="0x"+"22".repeat(32),
    f=>f.coverages[0].snapshotBlock=19
  ];
  for(const change of variants){const f=copy();change(f);assert.equal(verifyM08Coverage(f).status,"FAIL");}
});
test("M08 duplicate event identity is FAIL",()=>{
  const f=copy();f.events.push({...f.events[0]});
  assert.equal(verifyM08Coverage(f).status,"FAIL");
});
test("M08 non-enumerated or unknown event is FAIL",()=>{
  const f=copy();f.events[0].eventName="FundingSettled";
  assert.equal(verifyM08Coverage(f).status,"FAIL");
});
test("M08 missing entire contract coverage is FAIL",()=>{
  const f=copy();f.coverages.pop();
  assert.equal(verifyM08Coverage(f).status,"FAIL");
});
test("M08 no event is not proof of no accounts",()=>{
  const f=copy();f.events=[];f.coverages[0].ranges[0].logCount=0;
  const r=verifyM08Coverage(f);
  assert.equal(r.status,"COVERAGE_FORMAT_PASS");
  assert.equal(r.inventoryComplete,false);
  assert.equal(r.discoveredAccounts.length,0);
});
