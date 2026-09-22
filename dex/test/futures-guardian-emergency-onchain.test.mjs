import assert from "node:assert/strict";
import fs from "node:fs";
import ganache from "./support/anvil-compat.mjs";
import { ethers } from "ethers";

const artifact=(name,source)=>JSON.parse(fs.readFileSync(new URL(`../artifacts/contracts/${source}.sol/${name}.json`,import.meta.url)));
const deploy=async(signer,name,source,args=[])=>{const a=artifact(name,source);const c=await new ethers.ContractFactory(a.abi,a.bytecode,signer).deploy(...args);await c.waitForDeployment();return c;};

describe("Master 7/6-2 guardian emergency escalation",function(){
 this.timeout(30000);
 let provider,owner,guardian,outsider,registry,indexToken,collateral,oracle;
 beforeEach(async function(){
  provider=new ethers.BrowserProvider(ganache.provider({logging:{quiet:true},wallet:{totalAccounts:5}}));
  owner=await provider.getSigner(0); guardian=await provider.getSigner(1); outsider=await provider.getSigner(2);
  indexToken=await deploy(owner,"MockERC20","mocks/MockERC20",["Mock BTC","mBTC"]);
  collateral=await deploy(owner,"MockERC20","mocks/MockERC20",["Mock USDT","mUSDT"]);
  oracle=await deploy(owner,"MockLQCFuturesOracle","futures/mocks/MockLQCFuturesOracle");
  registry=await deploy(owner,"LQCFuturesMarketRegistry","futures/LQCFuturesMarketRegistry",[await owner.getAddress()]);
  await(await registry.addMarket(ethers.encodeBytes32String("BTC/USDT"),await indexToken.getAddress(),await collateral.getAddress(),await oracle.getAddress(),100_000,500)).wait();
  await(await registry.setGuardian(await guardian.getAddress())).wait();
 });
 it("lets only Governance configure the Guardian",async function(){
  await assert.rejects(registry.connect(outsider).setGuardian(await outsider.getAddress()));
  assert.equal(await registry.guardian(),await guardian.getAddress());
 });
 it("lets Guardian escalate ACTIVE to REDUCE_ONLY and then HALTED",async function(){
  await(await registry.connect(guardian).setEmergencyMarketMode(1,1)).wait();
  assert.equal(await registry.marketMode(1),1n);
  await(await registry.connect(guardian).setEmergencyMarketMode(1,2)).wait();
  assert.equal(await registry.marketMode(1),2n);
 });
 it("prevents Guardian from loosening restrictions or restoring ACTIVE",async function(){
  await(await registry.connect(guardian).setEmergencyMarketMode(1,2)).wait();
  await assert.rejects(registry.connect(guardian).setEmergencyMarketMode(1,1));
  await assert.rejects(registry.connect(guardian).setEmergencyMarketMode(1,0));
 });
 it("prevents outsiders from changing emergency mode",async function(){
  await assert.rejects(registry.connect(outsider).setEmergencyMarketMode(1,2));
 });
 it("keeps Governance recovery authority",async function(){
  await(await registry.connect(guardian).setEmergencyMarketMode(1,2)).wait();
  await(await registry.setMarketMode(1,1)).wait();
  await(await registry.setMarketMode(1,0)).wait();
  assert.equal(await registry.marketMode(1),0n);
 });
});
