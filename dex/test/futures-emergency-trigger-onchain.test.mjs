import assert from "node:assert/strict";
import fs from "node:fs";
import ganache from "./support/anvil-compat.mjs";
import { ethers } from "ethers";
const artifact=(n,s)=>JSON.parse(fs.readFileSync(new URL(`../artifacts/contracts/${s}.sol/${n}.json`,import.meta.url)));
const deploy=async(x,n,s,a=[])=>{const z=artifact(n,s);const c=await new ethers.ContractFactory(z.abi,z.bytecode,x).deploy(...a);await c.waitForDeployment();return c;};
describe("Master 7/6-3 emergency trigger integration",function(){
 this.timeout(30000); let provider,owner,guardian,outsider,registry,indexToken,collateral,oracle;
 beforeEach(async function(){
  provider=new ethers.BrowserProvider(ganache.provider({logging:{quiet:true},wallet:{totalAccounts:5}})); owner=await provider.getSigner(0);guardian=await provider.getSigner(1);outsider=await provider.getSigner(2);
  indexToken=await deploy(owner,"MockERC20","mocks/MockERC20",["BTC","BTC"]);collateral=await deploy(owner,"MockERC20","mocks/MockERC20",["USDT","USDT"]);oracle=await deploy(owner,"MockLQCFuturesOracle","futures/mocks/MockLQCFuturesOracle");
  registry=await deploy(owner,"LQCFuturesMarketRegistry","futures/LQCFuturesMarketRegistry",[await owner.getAddress()]);
  await(await registry.addMarket(ethers.encodeBytes32String("BTC/USDT"),await indexToken.getAddress(),await collateral.getAddress(),await oracle.getAddress(),100_000,500)).wait();
  await(await registry.setGuardian(await guardian.getAddress())).wait();
 });
 it("moves ACTIVE to REDUCE_ONLY on residual bad debt",async()=>{await(await registry.connect(guardian).applyEmergencyTriggers(1,true,true,true)).wait();assert.equal(await registry.marketMode(1),1n);});
 it("halts on unhealthy oracle",async()=>{await(await registry.connect(guardian).applyEmergencyTriggers(1,false,true,false)).wait();assert.equal(await registry.marketMode(1),2n);});
 it("halts on circuit-breaker failure",async()=>{await(await registry.connect(guardian).applyEmergencyTriggers(1,true,false,false)).wait();assert.equal(await registry.marketMode(1),2n);});
 it("never loosens an existing restriction",async()=>{await(await registry.connect(guardian).setEmergencyMarketMode(1,2)).wait();await(await registry.connect(guardian).applyEmergencyTriggers(1,true,true,false)).wait();assert.equal(await registry.marketMode(1),2n);});
 it("rejects unauthorized trigger callers",async()=>{await assert.rejects(registry.connect(outsider).applyEmergencyTriggers(1,false,true,false));});
});
