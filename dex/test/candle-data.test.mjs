import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const source=fs.readFileSync(path.join(root,"app/candle-data.js"),"utf8");
const context={URL,AbortController,setTimeout,clearTimeout,globalThis:null};context.globalThis=context;
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
    await assert.rejects(()=>api.load("https://charts.example",{chainId:97,base:"a",quote:"b",timeframe:"1m"},{fetcher:async()=>({ok:true,json:async()=>({candles:[[1,1,1,1,1,0]]})})}),/incomplete/);
  });
});
