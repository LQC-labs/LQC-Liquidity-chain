import assert from "node:assert/strict";
import fs from "node:fs";
import ganache from "ganache";
import { ethers } from "ethers";

const artifact=(name,source)=>JSON.parse(fs.readFileSync(new URL(`../artifacts/contracts/${source}.sol/${name}.json`,import.meta.url)));

describe("LQC Intent v1 bonded Solver registry",function(){
  this.timeout(30000);
  let provider,owner,guardian,solver,manager,outsider,bond,registry;
  const deploy=async(name,source,signer,...args)=>{const a=artifact(name,source),c=await new ethers.ContractFactory(a.abi,a.bytecode,signer).deploy(...args);await c.waitForDeployment();return c};

  beforeEach(async function(){
    provider=new ethers.BrowserProvider(ganache.provider({chain:{chainId:31337},logging:{quiet:true}}));owner=await provider.getSigner(0);guardian=await provider.getSigner(1);solver=await provider.getSigner(2);manager=await provider.getSigner(3);outsider=await provider.getSigner(4);bond=await deploy("MockERC20","mocks/MockERC20",owner,"Bond","BOND");registry=await deploy("LQCSolverRegistry","intent-v1/LQCSolverRegistry",owner,await bond.getAddress(),await owner.getAddress(),await guardian.getAddress(),100n);await(await bond.mint(await solver.getAddress(),200n)).wait();await(await bond.connect(solver).approve(await registry.getAddress(),200n)).wait();await(await registry.setExposureManager(await manager.getAddress())).wait();await(await registry.configureSolver(await solver.getAddress(),true,1000n)).wait();
  });

  it("requires the minimum bond and enforces cumulative exposure",async function(){
    const solverAddress=await solver.getAddress(),a=ethers.id("exposure-a"),b=ethers.id("exposure-b");assert.equal(await registry.isSolverEligible(solverAddress,1n),false);await(await registry.connect(solver).depositBond(100n)).wait();assert.equal(await registry.isSolverEligible(solverAddress,700n),true);await assert.rejects(registry.connect(outsider).openExposure(a,solverAddress,700n));await(await registry.connect(manager).openExposure(a,solverAddress,700n)).wait();assert.equal((await registry.getSolver(solverAddress)).exposure,700n);assert.equal(await registry.isSolverEligible(solverAddress,301n),false);await assert.rejects(registry.connect(manager).openExposure(b,solverAddress,301n));await(await registry.connect(manager).closeExposure(a)).wait();assert.equal((await registry.getSolver(solverAddress)).exposure,0n);
  });

  it("blocks eligibility during the seven-day withdrawal delay",async function(){
    const solverAddress=await solver.getAddress();await(await registry.connect(solver).depositBond(200n)).wait();await(await registry.connect(solver).requestWithdrawal(100n)).wait();assert.equal(await registry.isSolverEligible(solverAddress,1n),false);await assert.rejects(registry.connect(solver).withdrawBond());await provider.send("evm_increaseTime",[7*24*60*60]);await provider.send("evm_mine",[]);await(await registry.connect(solver).withdrawBond({gasLimit:200000n})).wait();assert.equal((await registry.getSolver(solverAddress)).bond,100n);assert.equal(await registry.isSolverEligible(solverAddress,1n),true);
  });

  it("cannot request withdrawal with live exposure and supports cancellation",async function(){
    const solverAddress=await solver.getAddress(),intent=ethers.id("live");await(await registry.connect(solver).depositBond(200n)).wait();await(await registry.connect(manager).openExposure(intent,solverAddress,50n)).wait();await assert.rejects(registry.connect(solver).requestWithdrawal(1n));await(await registry.connect(manager).closeExposure(intent)).wait();await(await registry.connect(solver).requestWithdrawal(50n)).wait();await(await registry.connect(solver).cancelWithdrawal()).wait();assert.equal(await registry.isSolverEligible(solverAddress,50n),true);
  });

  it("lets the guardian pause exposure but only the owner resume",async function(){
    await(await registry.connect(solver).depositBond(100n)).wait();await(await registry.connect(guardian).setPaused(true)).wait();assert.equal(await registry.isSolverEligible(await solver.getAddress(),1n),false);await assert.rejects(registry.connect(guardian).setPaused(false));await(await registry.setPaused(false)).wait();assert.equal(await registry.isSolverEligible(await solver.getAddress(),1n),true);await assert.rejects(registry.connect(outsider).configureSolver(await solver.getAddress(),false,0n));
  });
});
