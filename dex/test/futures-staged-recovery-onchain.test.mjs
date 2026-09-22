import assert from "node:assert/strict";
import fs from "node:fs";
import ganache from "./support/anvil-compat.mjs";
import { ethers } from "ethers";
const artifact=(n,s)=>JSON.parse(fs.readFileSync(new URL(`../artifacts/contracts/${s}.sol/${n}.json`,import.meta.url)));
const deploy=async(x,n,s,a=[])=>{const z=artifact(n,s);const c=await new ethers.ContractFactory(z.abi,z.bytecode,x).deploy(...a);await c.waitForDeployment();return c;};
describe("Master 7/6-4 staged Governance recovery",function(){
 this.timeout(30000); let provider,owner,guardian,outsider,registry,indexToken,collateral,oracle;
 beforeEach(async function(){
  provider=new ethers.BrowserProvider(ganache.provider({logging:{quiet:true},wallet:{totalAccounts:5}}));owner=await provider.getSigner(0);guardian=await provider.getSigner(1);outsider=await provider.getSigner(2);
  indexToken=await deploy(owner,"MockERC20","mocks/MockERC20",["BTC","BTC"]);collateral=await deploy(owner,"MockERC20","mocks/MockERC20",["USDT","USDT"]);oracle=await deploy(owner,"MockLQCFuturesOracle","futures/mocks/MockLQCFuturesOracle");
  registry=await deploy(owner,"LQCFuturesMarketRegistry","futures/LQCFuturesMarketRegistry",[await owner.getAddress()]);
  await(await registry.addMarket(ethers.encodeBytes32String("BTC/USDT"),await indexToken.getAddress(),await collateral.getAddress(),await oracle.getAddress(),100_000,500)).wait();await(await registry.setGuardian(await guardian.getAddress())).wait();
 });
 const minedReject=async(p)=>assert.rejects(async()=>{const tx=await p;await tx.wait();});
 it("forbids HALTED to ACTIVE direct recovery",async()=>{await(await registry.connect(guardian).setEmergencyMarketMode(1,2)).wait();await minedReject(registry.setMarketMode(1,0,{gasLimit:500000n}));});
 it("requires explicit Governance approval before REDUCE_ONLY to ACTIVE",async()=>{await(await registry.connect(guardian).setEmergencyMarketMode(1,2)).wait();await(await registry.setMarketMode(1,1)).wait();await minedReject(registry.setMarketMode(1,0,{gasLimit:500000n}));});
 it("allows staged recovery and consumes approval",async()=>{await(await registry.connect(guardian).setEmergencyMarketMode(1,2)).wait();await(await registry.setMarketMode(1,1)).wait();await(await registry.setRecoveryApproved(1,true)).wait();await(await registry.setMarketMode(1,0)).wait();assert.equal(await registry.marketMode(1),0n);assert.equal(await registry.recoveryApproved(1),false);});
 it("keeps recovery approval Governance-only",async()=>{await assert.rejects(registry.connect(guardian).setRecoveryApproved(1,true));await assert.rejects(registry.connect(outsider).setRecoveryApproved(1,true));});
});
