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
});

function address(number){return`0x${number.toString(16).padStart(40,'0')}`}
