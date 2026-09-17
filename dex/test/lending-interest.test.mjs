import assert from "node:assert/strict";
import fs from "node:fs";
import ganache from "ganache";
import { ethers } from "ethers";

const artifact=(name,source)=>JSON.parse(fs.readFileSync(new URL(`../artifacts/contracts/${source}.sol/${name}.json`,import.meta.url)));

describe("LQC Lending bounded interest model and indexes",function(){
  this.timeout(30000);
  let provider,owner,guardian,core,outsider,model,index,id;
  const deploy=async(name,source,signer,...args)=>{const a=artifact(name,source),c=await new ethers.ContractFactory(a.abi,a.bytecode,signer).deploy(...args);await c.waitForDeployment();return c};
  beforeEach(async function(){
    provider=new ethers.BrowserProvider(ganache.provider({logging:{quiet:true}}));owner=await provider.getSigner(0);guardian=await provider.getSigner(1);core=await provider.getSigner(2);outsider=await provider.getSigner(3);id=ethers.id("COLLATERAL-DEBT");
    model=await deploy("LQCInterestRateModel","lending/LQCInterestRateModel",owner,owner.address,guardian.address);
    await(await model.configureRate(id,{baseAprBps:200,slope1AprBps:800,slope2AprBps:9000,optimalUtilizationBps:8000,reserveFactorBps:1000,enabled:true})).wait();
    index=await deploy("LQCLendingInterestIndex","lending/LQCLendingInterestIndex",owner,owner.address,model.target);await(await index.initializeMarket(id)).wait();await(await index.setCore(core.address)).wait();
  });

  it("increases borrow cost across the utilization kink",async function(){
    const low=await model.rates(id,400n,1000n),optimal=await model.rates(id,800n,1000n),high=await model.rates(id,950n,1000n);
    assert.ok(low[0]<optimal[0]);assert.ok(optimal[0]<high[0]);assert.equal(low[2],400000000000000000000000000n);assert.ok(low[1]<low[0]);
  });

  it("accrues deterministic borrow and supplier indexes over time",async function(){
    const before=await index.indexStates(id);await provider.send("evm_increaseTime",[86400]);await provider.send("evm_mine",[]);
    const preview=await index.preview(id,800n,1000n),rates=await model.rates(id,800n,1000n);await(await index.connect(core).accrue(id,800n,1000n)).wait();const after=await index.indexStates(id);
    assert.ok(after.borrowIndexRay>=preview[0]&&after.borrowIndexRay-preview[0]<=rates[0]*2n);assert.ok(after.supplyIndexRay>=preview[1]&&after.supplyIndexRay-preview[1]<=rates[1]*2n);assert.ok(after.borrowIndexRay>before.borrowIndexRay);assert.ok(after.supplyIndexRay>before.supplyIndexRay);assert.ok(after.borrowIndexRay>after.supplyIndexRay);
  });

  it("restricts index updates to the approved core",async function(){
    await assert.rejects(index.connect(outsider).accrue(id,500n,1000n));await assert.rejects(index.connect(core).accrue(ethers.id("unknown"),500n,1000n));
  });

  it("enforces the APR cap and guardian pause-only authority",async function(){
    await assert.rejects(model.configureRate(id,{baseAprBps:1000,slope1AprBps:10000,slope2AprBps:10000,optimalUtilizationBps:8000,reserveFactorBps:1000,enabled:true}));
    await assert.rejects(model.connect(outsider).setRateEnabled(id,false));await(await model.connect(guardian).setRateEnabled(id,false)).wait();await assert.rejects(model.rates(id,1n,10n));await assert.rejects(model.connect(guardian).setRateEnabled(id,true));await(await model.setRateEnabled(id,true)).wait();
  });

  it("rejects impossible utilization and unsafe governance parameters",async function(){
    await assert.rejects(model.rates(id,1001n,1000n));await assert.rejects(model.configureRate(id,{baseAprBps:100,slope1AprBps:100,slope2AprBps:100,optimalUtilizationBps:4000,reserveFactorBps:1000,enabled:true}));await assert.rejects(model.configureRate(id,{baseAprBps:100,slope1AprBps:100,slope2AprBps:100,optimalUtilizationBps:8000,reserveFactorBps:3001,enabled:true}));
  });
});
