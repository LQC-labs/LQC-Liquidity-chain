import assert from "node:assert/strict";
import fs from "node:fs";
import ganache from "ganache";
import { ethers } from "ethers";

const artifact=(name)=>JSON.parse(fs.readFileSync(new URL(`../artifacts/contracts/intent-v1/${name}.sol/${name}.json`,import.meta.url)));

describe("LQC Intent v1 composite adapter registry",function(){
  this.timeout(30000);
  let owner,guardian,outsider,nextOwner,registry,swapAdapter,vaultAdapter;
  const deploy=async(name,signer,...args)=>{const a=artifact(name),contract=await new ethers.ContractFactory(a.abi,a.bytecode,signer).deploy(...args);await contract.waitForDeployment();return contract};
  const rejectsTransaction=async(send)=>assert.rejects(async()=>await(await send()).wait());

  beforeEach(async function(){
    const provider=new ethers.BrowserProvider(ganache.provider({logging:{quiet:true}}));
    owner=await provider.getSigner(0);guardian=await provider.getSigner(1);outsider=await provider.getSigner(2);nextOwner=await provider.getSigner(3);
    registry=await deploy("LQCCompositeAdapterRegistry",owner,await owner.getAddress(),await guardian.getAddress());
    swapAdapter=await deploy("LQCCompositePlan",owner);vaultAdapter=await deploy("LQCCompositePlan",owner);
  });

  it("pins reviewed adapter kind and runtime code hash",async function(){
    await(await registry.registerAdapter(await swapAdapter.getAddress(),0)).wait();
    const config=await registry.getAdapter(await swapAdapter.getAddress());
    assert.equal(config.kind,0n);assert.equal(config.enabled,true);assert.notEqual(config.runtimeCodeHash,ethers.ZeroHash);
    assert.equal(await registry.isAdapterAllowed(await swapAdapter.getAddress(),0),true);
    assert.equal(await registry.isAdapterAllowed(await swapAdapter.getAddress(),1),false);
    assert.equal(await registry.adapterCount(),1n);assert.equal(await registry.adapterAt(0),await swapAdapter.getAddress());
  });

  it("rejects EOAs, invalid kinds, duplicates and unauthorized registration",async function(){
    await rejectsTransaction(async()=>registry.registerAdapter(await outsider.getAddress(),0));
    await rejectsTransaction(async()=>registry.registerAdapter(await swapAdapter.getAddress(),3));
    await rejectsTransaction(async()=>registry.connect(outsider).registerAdapter(await swapAdapter.getAddress(),0));
    await(await registry.registerAdapter(await swapAdapter.getAddress(),0)).wait();
    await rejectsTransaction(async()=>registry.registerAdapter(await swapAdapter.getAddress(),0,{gasLimit:300000n}));
  });

  it("lets the guardian disable immediately but only governance re-enable",async function(){
    const adapter=await swapAdapter.getAddress();await(await registry.registerAdapter(adapter,0)).wait();
    await assert.rejects(registry.connect(outsider).setAdapterEnabled(adapter,false));
    await(await registry.connect(guardian).setAdapterEnabled(adapter,false)).wait();
    assert.equal(await registry.isAdapterAllowed(adapter,0),false);
    await assert.rejects(registry.connect(guardian).setAdapterEnabled(adapter,true));
    await(await registry.setAdapterEnabled(adapter,true)).wait();assert.equal(await registry.isAdapterAllowed(adapter,0),true);
  });

  it("requires disable-before-remove and preserves enumeration",async function(){
    const swap=await swapAdapter.getAddress(),vault=await vaultAdapter.getAddress();
    await(await registry.registerAdapter(swap,0)).wait();await(await registry.registerAdapter(vault,1)).wait();
    await rejectsTransaction(()=>registry.removeAdapter(swap));await(await registry.setAdapterEnabled(swap,false)).wait();await(await registry.removeAdapter(swap,{gasLimit:300000n})).wait();
    assert.equal(await registry.adapterCount(),1n);assert.equal(await registry.adapterAt(0),vault);await assert.rejects(registry.getAdapter(swap));
  });

  it("uses two-step ownership and keeps the guardian separate",async function(){
    const next=await nextOwner.getAddress();await(await registry.transferOwnership(next)).wait();
    await assert.rejects(registry.connect(outsider).acceptOwnership());await(await registry.connect(nextOwner).acceptOwnership()).wait();
    await assert.rejects(registry.registerAdapter(await swapAdapter.getAddress(),0));
    await(await registry.connect(nextOwner).registerAdapter(await swapAdapter.getAddress(),0)).wait();
    assert.equal(await registry.owner(),next);assert.equal(await registry.guardian(),await guardian.getAddress());
  });
});
