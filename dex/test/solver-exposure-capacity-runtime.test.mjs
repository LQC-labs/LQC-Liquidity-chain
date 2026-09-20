import assert from "node:assert/strict";
import fs from "node:fs";
import ganache from "./support/anvil-compat.mjs";
import { ethers } from "ethers";

const artifact = (path, name) => JSON.parse(fs.readFileSync(new URL(`../artifacts/contracts/${path}/${name}.json`, import.meta.url)));
const Token = artifact("test/IntentE2EMocks.sol", "IntentE2EToken");
const Registry = artifact("intent-v1/LQCSolverRegistry.sol", "LQCSolverRegistry");
const deploy = async (a, signer, ...args) => {
  const c = await new ethers.ContractFactory(a.abi, a.bytecode, signer).deploy(...args);
  await c.waitForDeployment(); return c;
};
async function fails(action){ await assert.rejects(action, e => e.code==="CALL_EXCEPTION" || /revert|missing revert data/i.test(String(e))); }

describe("7/4 Solver Exposure / Capacity EVM runtime gate", function () {
  this.timeout(30000);
  let chain, provider, owner, guardian, manager, solver, outsider, token, registry;
  beforeEach(async () => {
    chain=ganache.provider({chain:{chainId:97,hardfork:"shanghai"},logging:{quiet:true},wallet:{deterministic:true,totalAccounts:6}});
    provider=new ethers.BrowserProvider(chain);
    [owner,guardian,manager,solver,outsider]=await Promise.all([0,1,2,3,4].map(i=>provider.getSigner(i)));
    token=await deploy(Token,owner);
    registry=await deploy(Registry,owner,await token.getAddress(),await owner.getAddress(),await guardian.getAddress(),100n,500n);
    await (await registry.setExposureManager(await manager.getAddress())).wait();
    await (await token.mint(await solver.getAddress(),1000n)).wait();
    await (await token.connect(solver).approve(await registry.getAddress(),1000n)).wait();
  });
  afterEach(async()=>{provider.destroy();await chain.disconnect();});

  it("requires bonded active solver and exposure-manager authority", async()=>{
    await fails(()=>registry.connect(manager).increaseExposure.staticCall(await solver.getAddress(),1n));
    await (await registry.connect(solver).bond(300n)).wait();
    await fails(()=>registry.connect(outsider).increaseExposure.staticCall(await solver.getAddress(),1n));
    await (await registry.connect(manager).increaseExposure(await solver.getAddress(),200n)).wait();
    const s=await registry.solvers(await solver.getAddress()); assert.equal(s.exposure,200n); assert.equal(s.active,true);
  });

  it("caps exposure by both solver bond and protocol limit", async()=>{
    await (await registry.connect(solver).bond(300n)).wait();
    await fails(()=>registry.connect(manager).increaseExposure.staticCall(await solver.getAddress(),301n));
    await (await registry.connect(solver).bond(300n)).wait();
    await fails(()=>registry.connect(manager).increaseExposure.staticCall(await solver.getAddress(),501n));
    await (await registry.connect(manager).increaseExposure(await solver.getAddress(),500n)).wait();
    assert.equal((await registry.solvers(await solver.getAddress())).exposure,500n);
  });

  it("blocks bond withdrawal during live exposure and permits it after de-risking", async()=>{
    await (await registry.connect(solver).bond(300n)).wait();
    await (await registry.connect(manager).increaseExposure(await solver.getAddress(),200n)).wait();
    await fails(()=>registry.connect(solver).withdrawBond.staticCall(1n));
    await (await registry.connect(manager).decreaseExposure(await solver.getAddress(),200n)).wait();
    await (await registry.connect(solver).withdrawBond(250n)).wait();
    const s=await registry.solvers(await solver.getAddress()); assert.equal(s.bond,50n); assert.equal(s.active,false);
  });

  it("pause stops new exposure but preserves risk reduction", async()=>{
    await (await registry.connect(solver).bond(300n)).wait();
    await (await registry.connect(manager).increaseExposure(await solver.getAddress(),200n)).wait();
    await (await registry.connect(guardian).setPaused(true)).wait();
    await fails(()=>registry.connect(manager).increaseExposure.staticCall(await solver.getAddress(),1n));
    await (await registry.connect(manager).decreaseExposure(await solver.getAddress(),50n)).wait();
    assert.equal((await registry.solvers(await solver.getAddress())).exposure,150n);
  });

  it("fails closed on exposure underflow and unauthorized configuration", async()=>{
    await (await registry.connect(solver).bond(300n)).wait();
    await (await registry.connect(manager).increaseExposure(await solver.getAddress(),100n)).wait();
    await fails(()=>registry.connect(manager).decreaseExposure.staticCall(await solver.getAddress(),101n));
    await fails(()=>registry.connect(outsider).setExposureManager.staticCall(await outsider.getAddress()));
    await fails(()=>registry.connect(outsider).setLimits.staticCall(1n,1n));
    assert.equal((await registry.solvers(await solver.getAddress())).exposure,100n);
  });

  it("matches the futures safety invariant: saturation never blocks de-risking", async()=>{
    await (await registry.connect(solver).bond(500n)).wait();
    await (await registry.connect(manager).increaseExposure(await solver.getAddress(),500n)).wait();
    await fails(()=>registry.connect(manager).increaseExposure.staticCall(await solver.getAddress(),1n));
    await (await registry.connect(manager).decreaseExposure(await solver.getAddress(),100n)).wait();
    assert.equal((await registry.solvers(await solver.getAddress())).exposure,400n);
  });
});
