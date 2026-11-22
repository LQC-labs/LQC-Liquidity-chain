import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {ethers} from "ethers";
import {verifyM11Candidate} from "../scripts/verify-futures-m11-chain-snapshot.mjs";
const base=JSON.parse(readFileSync(new URL("../../test/fixtures/futures-m10-undesignated-candidate.json",import.meta.url),"utf8"));
const copy=()=>structuredClone(base);
const names=["registry","vault","engine","oracle","collateralToken"];
const addr=i=>"0x"+BigInt(i).toString(16).padStart(40,"0");
const HASH="0x"+"77".repeat(32);
const B=144115366;
const ABI=new ethers.Interface([
 "function engine() view returns(address)",
 "function registry() view returns(address)",
 "function vault() view returns(address)",
 "function owner() view returns(address)",
 "function guardian() view returns(address)",
 "function marketCount() view returns(uint256)",
 "function markets(uint256) view returns(bytes32,address,address,address,uint32,uint32,bool)"
]);
const code="0x6001600055",codehash=ethers.keccak256(code);
function filled(){
 const m=copy();
 names.forEach((name,i)=>m.candidate[name]=addr(i+1));
 m.wiring={vaultEngine:m.candidate.engine,engineRegistry:m.candidate.registry,
  engineVault:m.candidate.vault,marketOracle:m.candidate.oracle};
 m.source={registryRuntimeCodehash:codehash,vaultRuntimeCodehash:codehash,
   engineRuntimeCodehash:codehash,oracleRuntimeCodehash:codehash};
 m.m11={blockNumber:B,blockHash:HASH,marketId:1,owners:{
    registry:addr(6),vault:addr(7),oracle:addr(8)},guardian:addr(9)};
 return m;
}
function mocked(m,options={}){
 const counters={reads:0,code:0,call:0};
 const p={
   getNetwork:async()=>{counters.reads++;return {chainId:BigInt(options.chainId??97)}},
   getBlock:async()=>{counters.reads++;return {hash:options.blockHash||HASH}},
   getCode:async(to,tag)=>{counters.code++;assert.equal(tag,B);
      return options.emptyCode&&to.toLowerCase()===m.candidate.vault.toLowerCase()?"0x":code;},
   call:async({to,data},tag)=>{
      counters.call++;assert.equal(tag,B);
      const key=Object.keys(m.candidate).find(k=>typeof m.candidate[k]==="string"&&m.candidate[k].toLowerCase()===to.toLowerCase());
      const parsed=ABI.parseTransaction({data});
      let value;
      switch(parsed.name){
       case "engine":value=[options.badEngine?addr(9):m.candidate.engine];break;
       case "registry":value=[m.candidate.registry];break;
       case "vault":value=[m.candidate.vault];break;
       case "owner":value=[m.m11.owners[key]];break;
       case "guardian":value=[m.m11.guardian];break;
       case "marketCount":value=[1];break;
       case "markets":value=["0x"+"00".repeat(32),addr(10),m.candidate.collateralToken,
         options.badOracle?addr(9):m.candidate.oracle,100000,500,true];break;
       default:throw Error("unexpected ABI read "+parsed.name);
      }
      return ABI.encodeFunctionResult(parsed.name,value);
   }
 };
 return {p,counters};
}
test("M11 unknown candidate is BLOCKED and makes zero RPC calls",async()=>{
 const result=await verifyM11Candidate(copy(),{getNetwork(){throw Error("must not call RPC")}});
 assert.equal(result.status,"BLOCKED");
 assert.equal(result.rpcQueried,false);
 assert.ok(result.blockers.some(x=>x.includes("UNASSIGNED")));
});
test("M11 pinned contract wiring and runtime evidence can match, but deployment stays BLOCKED",async()=>{
 const m=filled(),{p,counters}=mocked(m);
 const r=await verifyM11Candidate(m,p);
 assert.equal(r.status,"BLOCKED",r.failures.join(","));
 assert.equal(r.failures.length,0);
 assert.ok(r.checks.some(x=>x.name==="marketOracleAndCollateral"));
 assert.equal(counters.code,4);
 assert.equal(r.deploymentAuthorized,false);
 assert.equal(r.assetTransferAuthorized,false);
});
test("M11 rejects historical Vault substitution without network calls",async()=>{
 const m=filled();m.candidate.vault=m.historical.vault;
 const {p,counters}=mocked(m);const r=await verifyM11Candidate(m,p);
 assert.equal(r.status,"FAIL");assert.equal(counters.reads,0);
});
test("M11 rejects wrong chain and anchored block hash",async()=>{
 const m=filled();const {p}=mocked(m,{chainId:56});
 assert.equal((await verifyM11Candidate(m,p)).status,"FAIL");
 const {p:p2}=mocked(m,{blockHash:"0x"+"88".repeat(32)});
 assert.equal((await verifyM11Candidate(m,p2)).status,"FAIL");
});
test("M11 rejects missing code or bytecode mismatch",async()=>{
 const m=filled(),{p}=mocked(m,{emptyCode:true});
 assert.equal((await verifyM11Candidate(m,p)).status,"FAIL");
 const other=filled();other.source.oracleRuntimeCodehash="0x"+"cc".repeat(32);
 assert.equal((await verifyM11Candidate(other,mocked(other).p)).status,"FAIL");
});
test("M11 rejects wrong Engine wiring and Oracle market mapping",async()=>{
 const m=filled();
 assert.equal((await verifyM11Candidate(m,mocked(m,{badEngine:true}).p)).status,"FAIL");
 assert.equal((await verifyM11Candidate(m,mocked(m,{badOracle:true}).p)).status,"FAIL");
});
