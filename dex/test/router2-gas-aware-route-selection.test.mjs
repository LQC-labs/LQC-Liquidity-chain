import assert from "node:assert/strict";
import fs from "node:fs";
import ganache from "ganache";
import { ethers } from "ethers";
const art=(n,s)=>JSON.parse(fs.readFileSync(new URL(`../artifacts/contracts/${s}.sol/${n}.json`,import.meta.url)));
describe("LQC official 2/5 Gas-aware Route Selection",function(){
 this.timeout(30000);let p,o,u,r,q,a,b;const dep=async(n,s,sg,...x)=>{const z=art(n,s),c=await new ethers.ContractFactory(z.abi,z.bytecode,sg).deploy(...x);await c.waitForDeployment();return c};
 const add=async(id,num,priority)=>{const x=await dep("MockRouterV2DexAdapter","mocks/MockRouterV2DexAdapter",o,num,100);await(await r.addDex(ethers.id(id),x.target,id,priority)).wait();return x};
 const req=async()=>{const block=await p.getBlock("latest");return {chainId:(await p.getNetwork()).chainId,tokenIn:a.target,tokenOut:b.target,amountIn:1000n,recipient:u.address,slippageBps:100,validUntil:BigInt(block.timestamp+300)}};
 beforeEach(async()=>{p=new ethers.BrowserProvider(ganache.provider({logging:{quiet:true}}));o=await p.getSigner(0);u=await p.getSigner(1);r=await dep("LQCDexRegistry","router-v2/LQCDexRegistry",o,o.address);q=await dep("LQCQuoteRouter","router-v2/LQCQuoteRouter",o,r.target);a=await dep("MockERC20","mocks/MockERC20",o,"A","A");b=await dep("MockERC20","mocks/MockERC20",o,"B","B");});
 it("chooses lower gross output when its gas-adjusted net output is higher",async()=>{await add("CHEAP",105,10);await add("EXPENSIVE",110,100);const x=await q.quoteBestNet(await req(),["0x","0x"],[5n,100n],[0n,0n]);assert.equal(x.dexId,ethers.id("CHEAP"));assert.equal(x.grossAmountOut,1050n);assert.equal(x.netAmountOut,1045n);});
 it("combines gas and protocol fee in the same tokenOut denominator",async()=>{await add("A",110,1);await add("B",108,1);const x=await q.quoteBestNet(await req(),["0x","0x"],[20n,1n],[70n,1n]);assert.equal(x.dexId,ethers.id("B"));assert.equal(x.gasCostInTokenOut,1n);assert.equal(x.protocolFeeInTokenOut,1n);assert.equal(x.netAmountOut,1078n);});
 it("uses priority only after net output ties",async()=>{await add("LOW_PRIORITY",110,1);await add("HIGH_PRIORITY",109,99);const x=await q.quoteBestNet(await req(),["0x","0x"],[10n,0n],[0n,0n]);assert.equal(x.netAmountOut,1090n);assert.equal(x.dexId,ethers.id("HIGH_PRIORITY"));});
 it("excludes routes whose total cost equals or exceeds gross output",async()=>{await add("UNEconomic",100,100);await add("VALID",90,1);const x=await q.quoteBestNet(await req(),["0x","0x"],[1000n,10n],[0n,0n]);assert.equal(x.dexId,ethers.id("VALID"));assert.equal(x.netAmountOut,890n);});
 it("rejects cost-array cardinality drift instead of comparing misaligned DEX costs",async()=>{await add("A",100,1);await add("B",100,1);const request=await req();await assert.rejects(q.quoteBestNet(request,["0x","0x"],[0n],[0n,0n]));await assert.rejects(q.quoteBestNet(request,["0x","0x"],[0n,0n],[0n]));});
});