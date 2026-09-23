import assert from "node:assert/strict";
import fs from "node:fs";
import anvil from "./support/anvil-compat.mjs";
import { ethers } from "ethers";

const artifact=(name,source)=>JSON.parse(fs.readFileSync(new URL(`../artifacts/contracts/${source}.sol/${name}.json`,import.meta.url)));
const deploy=async(signer,name,source,args=[])=>{const a=artifact(name,source);const c=await new ethers.ContractFactory(a.abi,a.bytecode,signer).deploy(...args);await c.waitForDeployment();return c;};

describe("LQCPythReferenceAdapter", function(){
 let provider,owner,pyth;
 const ID="0x2f95862b045670cd22bee3114c39763a4a08beeb663b145d283c31d7d1101c4f";

 beforeEach(async function(){
   provider=new ethers.BrowserProvider(anvil.provider({logging:{quiet:true}}));
   owner=await provider.getSigner(0);
   pyth=await deploy(owner,"MockPyth","futures/mocks/MockPyth");
 });

 const fixture=async(maxAge=120,maxConfidenceBps=500)=>{
   return deploy(owner,"LQCPythReferenceAdapter","futures/LQCPythReferenceAdapter",[await pyth.getAddress(),ID,maxAge,maxConfidenceBps]);
 };

 it("normalizes BNB/USD style exponent -8 to 1e18 and returns publishTime as round metadata",async function(){
   const adapter=await fixture();
   const now=BigInt((await provider.getBlock("latest")).timestamp);
   await (await pyth.setPrice(77879546446n,1000000n,-8,now)).wait();
   const [roundId,answer,startedAt,updatedAt,answeredInRound]=await adapter.latestRoundData();
   assert.equal(answer,778795464460000000000n);
   assert.equal(updatedAt,now);
   assert.equal(startedAt,now);
   assert.equal(roundId,now);
   assert.equal(answeredInRound,roundId);
   assert.equal(await adapter.decimals(),18n);
 });

 it("normalizes positive and deeply negative supported exponents",async function(){
   const adapter=await fixture();
   let now=BigInt((await provider.getBlock("latest")).timestamp);
   await (await pyth.setPrice(2n,1n,2,now)).wait();
   assert.equal((await adapter.latestRoundData())[1],200000000000000000000n);
   now=BigInt((await provider.getBlock("latest")).timestamp);
   await (await pyth.setPrice(123456789n,1n,-20,now)).wait();
   assert.equal((await adapter.latestRoundData())[1],1234567n);
 });

 it("fails closed on stale Pyth data",async function(){
   const adapter=await fixture(120);
   const now=BigInt((await provider.getBlock("latest")).timestamp);
   await (await pyth.setPrice(10000000000n,1n,-8,now-121n)).wait();
   await assert.rejects(adapter.latestRoundData());
 });

 it("rejects zero or negative prices and future timestamps",async function(){
   const adapter=await fixture();
   let now=BigInt((await provider.getBlock("latest")).timestamp);
   for(const price of [0n,-1n]){
     await (await pyth.setPrice(price,1n,-8,now)).wait();
     await assert.rejects(adapter.latestRoundData());
   }
   now=BigInt((await provider.getBlock("latest")).timestamp);
   await (await pyth.setPrice(10000000000n,1n,-8,now+60n)).wait();
   await assert.rejects(adapter.latestRoundData());
 });

 it("rejects excessive confidence width",async function(){
   const adapter=await fixture(120,500);
   const now=BigInt((await provider.getBlock("latest")).timestamp);
   await (await pyth.setPrice(10000000000n,600000000n,-8,now)).wait();
   await assert.rejects(adapter.latestRoundData());
 });

 it("rejects unsupported exponents and normalization-to-zero",async function(){
   const adapter=await fixture();
   let now=BigInt((await provider.getBlock("latest")).timestamp);
   await (await pyth.setPrice(100n,1n,-37,now)).wait();
   await assert.rejects(adapter.latestRoundData());
   now=BigInt((await provider.getBlock("latest")).timestamp);
   await (await pyth.setPrice(1n,0n,-36,now)).wait();
   await assert.rejects(adapter.latestRoundData());
 });

 it("rejects unsafe constructor configuration",async function(){
   const a=artifact("LQCPythReferenceAdapter","futures/LQCPythReferenceAdapter");
   const factory=new ethers.ContractFactory(a.abi,a.bytecode,owner);
   await assert.rejects(factory.deploy(ethers.ZeroAddress,ID,120,500));
   await assert.rejects(factory.deploy(await pyth.getAddress(),ethers.ZeroHash,120,500));
   await assert.rejects(factory.deploy(await pyth.getAddress(),ID,0,500));
   await assert.rejects(factory.deploy(await pyth.getAddress(),ID,86401,500));
   await assert.rejects(factory.deploy(await pyth.getAddress(),ID,120,0));
   await assert.rejects(factory.deploy(await pyth.getAddress(),ID,120,5001));
 });

 it("is directly compatible with LQCAggregatorOracleAdapter as referenceFeed",async function(){
   const reference=await fixture(120,500);
   const primary=await deploy(owner,"MockAggregatorV3","futures/mocks/MockAggregatorV3",[8]);
   const agg=await deploy(owner,"LQCAggregatorOracleAdapter","futures/LQCAggregatorOracleAdapter",[await owner.getAddress()]);
   const token=await deploy(owner,"MockERC20","mocks/MockERC20",["Wrapped BNB","WBNB"]);
   const now=BigInt((await provider.getBlock("latest")).timestamp);
   await (await pyth.setPrice(10000000000n,1000000n,-8,now)).wait();
   await (await primary.setRoundData(1,10000000000n,now,1)).wait();
   await (await agg.setFeed(await token.getAddress(),await primary.getAddress(),120)).wait();
   await (await agg.setCircuitBreaker(await token.getAddress(),await reference.getAddress(),500)).wait();
   assert.equal((await agg.getPrice(await token.getAddress()))[0],ethers.parseEther("100"));

   const now2=BigInt((await provider.getBlock("latest")).timestamp);
   await (await pyth.setPrice(9000000000n,1000000n,-8,now2)).wait();
   await assert.rejects(agg.getPrice(await token.getAddress()));
 });
});
