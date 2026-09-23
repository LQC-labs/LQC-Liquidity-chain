import assert from "node:assert/strict";
import fs from "node:fs";
import anvil from "./support/anvil-compat.mjs";
import { ethers } from "ethers";

const artifact=(name,source)=>JSON.parse(fs.readFileSync(new URL(`../artifacts/contracts/${source}.sol/${name}.json`,import.meta.url)));
const deploy=async(signer,name,source,args=[])=>{const a=artifact(name,source);const c=await new ethers.ContractFactory(a.abi,a.bytecode,signer).deploy(...args);await c.waitForDeployment();return c;};

describe("LQCPythUpdateHelper",function(){
 let provider,caller,pyth,helper;
 beforeEach(async function(){
   provider=new ethers.BrowserProvider(anvil.provider({logging:{quiet:true}}));
   caller=await provider.getSigner(0);
   pyth=await deploy(caller,"MockPyth","futures/mocks/MockPyth");
   helper=await deploy(caller,"LQCPythUpdateHelper","futures/LQCPythUpdateHelper",[await pyth.getAddress()]);
 });

 it("submits permissionless update using authoritative getUpdateFee",async function(){
   await (await pyth.setUpdateFee(123n)).wait();
   await (await helper.update(["0x1234"],{value:123n})).wait();
   assert.equal(await pyth.updateCalls(),1n);
   assert.equal(await pyth.lastValue(),123n);
 });

 it("supports zero-fee Pyth updates",async function(){
   await (await pyth.setUpdateFee(0)).wait();
   await (await helper.update(["0x1234"])).wait();
   assert.equal(await pyth.updateCalls(),1n);
   assert.equal(await pyth.lastValue(),0n);
 });

 it("rejects empty payload and insufficient msg.value",async function(){
   await assert.rejects(helper.update([]));
   await (await pyth.setUpdateFee(100n)).wait();
   await assert.rejects(helper.update(["0x12"],{value:99n}));
   assert.equal(await pyth.updateCalls(),0n);
 });

 it("refunds excess value to caller",async function(){
   await (await pyth.setUpdateFee(100n)).wait();
   const before=await provider.getBalance(await helper.getAddress());
   await (await helper.update(["0x12"],{value:200n})).wait();
   const after=await provider.getBalance(await helper.getAddress());
   assert.equal(before,0n);
   assert.equal(after,0n);
   assert.equal(await pyth.lastValue(),100n);
 });

 it("has no owner, governance setter, or price-setting authority",async function(){
   const abi=artifact("LQCPythUpdateHelper","futures/LQCPythUpdateHelper").abi;
   const names=new Set(abi.filter(x=>x.type==="function").map(x=>x.name));
   for(const forbidden of ["owner","setOwner","setFeed","setCircuitBreaker","setPrice","pause","withdraw"]) assert.equal(names.has(forbidden),false);
   assert.equal(names.has("update"),true);
 });
});
