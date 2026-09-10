import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { ethers } from "ethers";
import { signCandlePayload } from "../scripts/candle-indexer-proof.mjs";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const source=fs.readFileSync(path.join(root,"app/candle-data.js"),"utf8");
const context={URL,AbortController,setTimeout,clearTimeout,ethers,globalThis:null};context.globalThis=context;
vm.runInNewContext(source,context);
const api=context.LQCCandleData;

describe("LQC candle data boundary",function(){
  it("normalizes, sorts, deduplicates, and rejects malformed candles",function(){
    const result=api.normalize([
      [2,10,12,9,11,5],[1,8,9,7,8.5,4],[2,10,13,9,12,6],
      [3,10,9,8,11,1],{time:4,open:10,high:12,low:0,close:11,volume:1}
    ]);
    assert.equal(result.length,2);assert.equal(result[0].time,1);assert.equal(result[1].close,12);
  });
  it("binds requests to chain, pair, interval, and a bounded limit",function(){
    const url=new URL(api.requestUrl("https://charts.example/candles",{chainId:97,base:"0xbase",quote:"0xquote",timeframe:"1W",limit:999}));
    assert.equal(url.searchParams.get("chainId"),"97");assert.equal(url.searchParams.get("base"),"0xbase");assert.equal(url.searchParams.get("quote"),"0xquote");assert.equal(url.searchParams.get("timeframe"),"1W");assert.equal(url.searchParams.get("limit"),"300");
    assert.throws(()=>api.requestUrl("https://charts.example",{timeframe:"2h"}),/Unsupported/);
  });
  it("fails closed when an indexer returns insufficient history",async function(){
    const wallet=ethers.Wallet.createRandom(),base=address(1),quote=address(2),now=Math.floor(Date.now()/1000),raw=await signCandlePayload({chainId:97,base,quote,timeframe:"1m",candles:[[1,1,1,1,1,0]],issuedAt:now,expiresAt:now+30,cursor:2,finalizedBlock:1},wallet);
    await assert.rejects(()=>api.load("https://charts.example",{chainId:97,base,quote,timeframe:"1m"},{fetcher:async()=>({ok:true,json:async()=>raw}),expectedSigner:wallet.address,ethersLib:ethers}),/incomplete/);
  });

  it("accepts only a signed response bound to the requested market",async function(){
    const wallet=ethers.Wallet.createRandom(),base=address(1),quote=address(2),now=Math.floor(Date.now()/1000),raw=await signCandlePayload({chainId:97,base,quote,timeframe:"1m",candles:[[1,1,2,1,2,3],[2,2,3,2,3,4]],issuedAt:now,expiresAt:now+30,cursor:3,finalizedBlock:2},wallet);
    const fetcher=async()=>({ok:true,json:async()=>raw}),candles=await api.load("https://charts.example",{chainId:97,base,quote,timeframe:"1m"},{fetcher,expectedSigner:wallet.address,ethersLib:ethers});assert.equal(candles.length,2);
    await assert.rejects(()=>api.load("https://charts.example",{chainId:97,base:quote,quote:base,timeframe:"1m"},{fetcher,expectedSigner:wallet.address,ethersLib:ethers}),/context/);
    const changed=structuredClone(raw);changed.candles[1][4]=99;await assert.rejects(()=>api.load("https://charts.example",{chainId:97,base,quote,timeframe:"1m"},{fetcher:async()=>({ok:true,json:async()=>changed}),expectedSigner:wallet.address,ethersLib:ethers}),/signature/);
  });

  it("rejects signed replay, rollback, and conflicting same-revision responses",async function(){
    const wallet=ethers.Wallet.createRandom(),base=address(11),quote=address(12),now=Math.floor(Date.now()/1000),watermarks=new api.CandleWatermarks(2),params={chainId:97,base,quote,timeframe:"5m"};
    const sign=(overrides={})=>signCandlePayload({chainId:97,base,quote,timeframe:"5m",candles:[[1,1,2,1,2,3],[2,2,3,2,3,4]],issuedAt:now,expiresAt:now+30,cursor:101,finalizedBlock:100,...overrides},wallet);
    const load=raw=>api.load("https://charts.example",params,{fetcher:async()=>({ok:true,json:async()=>raw}),expectedSigner:wallet.address,ethersLib:ethers,watermarks});
    const current=await sign();await load(current);await load(current);
    const oldCursor=await sign({cursor:100}),oldBlock=await sign({finalizedBlock:99}),oldIssue=await sign({issuedAt:now-1,expiresAt:now+29});
    await assert.rejects(()=>load(oldCursor),/replay or rollback/);
    await assert.rejects(()=>load(oldBlock),/replay or rollback/);
    await assert.rejects(()=>load(oldIssue),/replay or rollback/);
    const conflicting=await sign({candles:[[1,1,2,1,2,3],[2,2,4,2,4,5]]});
    await assert.rejects(()=>load(conflicting),/Conflicting/);
    await load(await sign({issuedAt:now+1,expiresAt:now+31,cursor:102,finalizedBlock:101}));
  });

  it("bounds remembered market watermarks",function(){
    const watermarks=new api.CandleWatermarks(1),payload={chainId:97,base:address(21),quote:address(22),timeframe:"1m",cursor:2,finalizedBlock:1,issuedAt:1};
    watermarks.accept(payload,"0x01");watermarks.accept({...payload,base:address(23)},"0x02");assert.equal(watermarks.values.size,1);
    assert.throws(()=>new api.CandleWatermarks(0),/limit/);
  });

  it("keeps verified watermarks across a same-tab reload and ignores corrupt storage",function(){
    const records=new Map(),storage={getItem:key=>records.get(key)||null,setItem:(key,value)=>records.set(key,value)},payload={chainId:97,base:address(31),quote:address(32),timeframe:"15m",cursor:51,finalizedBlock:50,issuedAt:10};
    const first=new api.CandleWatermarks(2,{storage});first.accept(payload,"0xabc");
    const restored=new api.CandleWatermarks(2,{storage});assert.throws(()=>restored.accept({...payload,cursor:50},"0xdef"),/replay or rollback/);assert.equal(restored.values.size,1);
    records.set('lqc:candle-watermarks:v1','not-json');assert.doesNotThrow(()=>new api.CandleWatermarks(2,{storage}));
    const unavailable={getItem(){throw new Error('blocked')},setItem(){throw new Error('blocked')}};const memoryOnly=new api.CandleWatermarks(2,{storage:unavailable});assert.doesNotThrow(()=>memoryOnly.accept(payload,"0xabc"));
  });
});

function address(number){return`0x${number.toString(16).padStart(40,'0')}`}
