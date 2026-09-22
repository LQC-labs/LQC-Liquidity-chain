import assert from "node:assert/strict";
import fs from "node:fs";
import ganache from "./support/anvil-compat.mjs";
import { ethers } from "ethers";

const artifact=(name,source)=>JSON.parse(fs.readFileSync(new URL(`../artifacts/contracts/${source}.sol/${name}.json`,import.meta.url)));
const deploy=async(signer,name,source,args=[])=>{const a=artifact(name,source);const c=await new ethers.ContractFactory(a.abi,a.bytecode,signer).deploy(...args);await c.waitForDeployment();return c;};

describe("Master 7/6-1 on-chain emergency market state",function(){
 this.timeout(30000);
 let provider,owner,trader,collateral,indexToken,oracle,registry,vault,engine; const usd=ethers.parseEther;
 beforeEach(async function(){
  provider=new ethers.BrowserProvider(ganache.provider({logging:{quiet:true},wallet:{totalAccounts:4}})); owner=await provider.getSigner(0); trader=await provider.getSigner(1);
  collateral=await deploy(owner,"MockERC20","mocks/MockERC20",["Mock USDT","mUSDT"]); indexToken=await deploy(owner,"MockERC20","mocks/MockERC20",["Mock BTC","mBTC"]);
  oracle=await deploy(owner,"MockLQCFuturesOracle","futures/mocks/MockLQCFuturesOracle"); registry=await deploy(owner,"LQCFuturesMarketRegistry","futures/LQCFuturesMarketRegistry",[await owner.getAddress()]);
  vault=await deploy(owner,"LQCFuturesVault","futures/LQCFuturesVault",[await owner.getAddress()]); engine=await deploy(owner,"LQCPerpEngine","futures/LQCPerpEngine",[await registry.getAddress(),await vault.getAddress()]);
  await(await vault.setEngine(await engine.getAddress())).wait(); await(await vault.setSupportedCollateral(await collateral.getAddress(),true)).wait();
  await(await registry.addMarket(ethers.encodeBytes32String("BTC/USDT"),await indexToken.getAddress(),await collateral.getAddress(),await oracle.getAddress(),100_000,500)).wait();
  await(await oracle.setPrice(await indexToken.getAddress(),usd("50000"),{gasLimit:100_000n})).wait();
  const a=await trader.getAddress(); await(await collateral.mint(a,usd("10000"))).wait(); await(await collateral.connect(trader).approve(await vault.getAddress(),ethers.MaxUint256)).wait(); await(await vault.connect(trader).deposit(await collateral.getAddress(),usd("5000"))).wait();
 });
 it("starts new markets ACTIVE and restricts mode changes to Governance",async function(){
  assert.equal(await registry.marketMode(1),0n);
  await assert.rejects(registry.connect(trader).setMarketMode(1,1));
 });
 it("blocks new opens in REDUCE_ONLY while preserving reduce/close",async function(){
  await(await engine.connect(trader).openPosition(1,usd("1000"),usd("5000"),true)).wait();
  await(await registry.setMarketMode(1,1)).wait();
  await(await engine.connect(trader).reducePosition(1,usd("1000"))).wait();
  await(await engine.connect(trader).closePosition(1)).wait();
  await assert.rejects(engine.connect(trader).openPosition(1,usd("1000"),usd("5000"),true));
 });
 it("blocks new opens in HALTED",async function(){
  await(await registry.setMarketMode(1,2)).wait();
  await assert.rejects(engine.connect(trader).openPosition(1,usd("1000"),usd("5000"),true));
 });
});
