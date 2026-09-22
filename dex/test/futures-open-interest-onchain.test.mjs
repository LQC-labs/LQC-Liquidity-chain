import assert from "node:assert/strict";
import fs from "node:fs";
import ganache from "./support/anvil-compat.mjs";
import { ethers } from "ethers";
const artifact=(n,s)=>JSON.parse(fs.readFileSync(new URL(`../artifacts/contracts/${s}.sol/${n}.json`,import.meta.url)));
const deploy=async(x,n,s,a=[])=>{const z=artifact(n,s);const c=await new ethers.ContractFactory(z.abi,z.bytecode,x).deploy(...a);await c.waitForDeployment();return c;};
describe("Master 7/6-6 market open-interest accounting",function(){
 this.timeout(30000);let provider,owner,a,b,registry,vault,engine,indexToken,collateral,oracle;const usd=ethers.parseEther;
 beforeEach(async function(){
  provider=new ethers.BrowserProvider(ganache.provider({logging:{quiet:true},wallet:{totalAccounts:5}}));owner=await provider.getSigner(0);a=await provider.getSigner(1);b=await provider.getSigner(2);
  indexToken=await deploy(owner,"MockERC20","mocks/MockERC20",["BTC","BTC"]);collateral=await deploy(owner,"MockERC20","mocks/MockERC20",["USDT","USDT"]);oracle=await deploy(owner,"MockLQCFuturesOracle","futures/mocks/MockLQCFuturesOracle");registry=await deploy(owner,"LQCFuturesMarketRegistry","futures/LQCFuturesMarketRegistry",[await owner.getAddress()]);vault=await deploy(owner,"LQCFuturesVault","futures/LQCFuturesVault",[await owner.getAddress()]);engine=await deploy(owner,"LQCPerpEngine","futures/LQCPerpEngine",[await registry.getAddress(),await vault.getAddress()]);
  await(await vault.setEngine(await engine.getAddress())).wait();await(await vault.setSupportedCollateral(await collateral.getAddress(),true)).wait();await(await registry.addMarket(ethers.encodeBytes32String("BTC/USDT"),await indexToken.getAddress(),await collateral.getAddress(),await oracle.getAddress(),100_000,500)).wait();await(await oracle.setPrice(await indexToken.getAddress(),usd("50000"),{gasLimit:100000n})).wait();
  for(const s of[a,b]){const x=await s.getAddress();await(await collateral.mint(x,usd("10000"))).wait();await(await collateral.connect(s).approve(await vault.getAddress(),ethers.MaxUint256)).wait();await(await vault.connect(s).deposit(await collateral.getAddress(),usd("5000"))).wait();}
 });
 it("tracks aggregate OI across traders and blocks the configured ceiling",async()=>{await(await engine.configureMarketOpenInterestLimit(1,usd("8000"))).wait();await(await engine.connect(a).openPosition(1,usd("1000"),usd("5000"),true)).wait();assert.equal(await engine.openInterestUsd(1),usd("5000"));await assert.rejects(engine.connect(b).openPosition(1,usd("1000"),usd("4000"),false));});
 it("decreases OI on partial reduction and full close",async()=>{await(await engine.connect(a).openPosition(1,usd("1000"),usd("5000"),true)).wait();await(await engine.connect(a).reducePosition(1,usd("1000"))).wait();assert.equal(await engine.openInterestUsd(1),usd("4000"));await(await engine.connect(a).closePosition(1)).wait();assert.equal(await engine.openInterestUsd(1),0n);});
 it("rejects Governance lowering the ceiling below live OI",async()=>{await(await engine.connect(a).openPosition(1,usd("1000"),usd("5000"),true)).wait();await assert.rejects(engine.configureMarketOpenInterestLimit(1,usd("4000")));});
});
