import assert from "node:assert/strict";
import fs from "node:fs";
import ganache from "./support/anvil-compat.mjs";
import { ethers } from "ethers";
const artifact=(n,s)=>JSON.parse(fs.readFileSync(new URL(`../artifacts/contracts/${s}.sol/${n}.json`,import.meta.url)));
const deploy=async(x,n,s,a=[])=>{const z=artifact(n,s);const c=await new ethers.ContractFactory(z.abi,z.bytecode,x).deploy(...a);await c.waitForDeployment();return c;};
describe("Master 7/6-5 on-chain notional risk limits",function(){
 this.timeout(30000); let provider,owner,trader,registry,vault,engine,indexToken,collateral,oracle; const usd=ethers.parseEther;
 beforeEach(async function(){
  provider=new ethers.BrowserProvider(ganache.provider({logging:{quiet:true},wallet:{totalAccounts:4}}));owner=await provider.getSigner(0);trader=await provider.getSigner(1);
  indexToken=await deploy(owner,"MockERC20","mocks/MockERC20",["BTC","BTC"]);collateral=await deploy(owner,"MockERC20","mocks/MockERC20",["USDT","USDT"]);oracle=await deploy(owner,"MockLQCFuturesOracle","futures/mocks/MockLQCFuturesOracle");
  registry=await deploy(owner,"LQCFuturesMarketRegistry","futures/LQCFuturesMarketRegistry",[await owner.getAddress()]);vault=await deploy(owner,"LQCFuturesVault","futures/LQCFuturesVault",[await owner.getAddress()]);engine=await deploy(owner,"LQCPerpEngine","futures/LQCPerpEngine",[await registry.getAddress(),await vault.getAddress()]);
  await(await vault.setEngine(await engine.getAddress())).wait();await(await vault.setSupportedCollateral(await collateral.getAddress(),true)).wait();await(await registry.addMarket(ethers.encodeBytes32String("BTC/USDT"),await indexToken.getAddress(),await collateral.getAddress(),await oracle.getAddress(),100_000,500)).wait();await(await oracle.setPrice(await indexToken.getAddress(),usd("50000"),{gasLimit:100000n})).wait();
  const a=await trader.getAddress();await(await collateral.mint(a,usd("10000"))).wait();await(await collateral.connect(trader).approve(await vault.getAddress(),ethers.MaxUint256)).wait();await(await vault.connect(trader).deposit(await collateral.getAddress(),usd("5000"))).wait();
 });
 it("keeps legacy baseline when limits are unset",async()=>{await(await engine.connect(trader).openPosition(1,usd("1000"),usd("5000"),true)).wait();});
 it("restricts configuration to Governance and validates bounds",async()=>{await assert.rejects(engine.connect(trader).configureMarketNotionalLimits(1,usd("5000"),usd("1000")));await assert.rejects(engine.configureMarketNotionalLimits(1,usd("1000"),usd("2000")));});
 it("blocks an order above max order notional",async()=>{await(await engine.configureMarketNotionalLimits(1,usd("5000"),usd("1000"))).wait();await assert.rejects(engine.connect(trader).openPosition(1,usd("1000"),usd("2000"),true));});
 it("allows an order inside both limits",async()=>{await(await engine.configureMarketNotionalLimits(1,usd("5000"),usd("5000"))).wait();await(await engine.connect(trader).openPosition(1,usd("1000"),usd("5000"),true)).wait();});
});
