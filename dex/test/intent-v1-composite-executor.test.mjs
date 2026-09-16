import assert from "node:assert/strict";
import fs from "node:fs";
import ganache from "ganache";
import { ethers } from "ethers";

const artifact=(name,source)=>JSON.parse(fs.readFileSync(new URL(`../artifacts/contracts/${source}.sol/${name}.json`,import.meta.url)));

describe("LQC Intent v1 atomic composite executor",function(){
  this.timeout(30000);
  let owner,user,outsider,token,vaultA,vaultB,validator,registry,executor,adapterA,adapterB;
  const deploy=async(name,source,signer,...args)=>{const a=artifact(name,source),c=await new ethers.ContractFactory(a.abi,a.bytecode,signer).deploy(...args);await c.waitForDeployment();return c};
  const intentHash=ethers.id("atomic-composite-intent"),emptyHash=ethers.keccak256("0x");

  beforeEach(async function(){
    const provider=new ethers.BrowserProvider(ganache.provider({logging:{quiet:true}}));owner=await provider.getSigner(0);user=await provider.getSigner(1);outsider=await provider.getSigner(2);
    token=await deploy("MockERC20","mocks/MockERC20",owner,"Asset","AST");
    vaultA=await deploy("LQCLiquidityVault","vault/LQCLiquidityVault",owner,await token.getAddress(),await owner.getAddress(),ethers.parseEther("1000000"),"Vault A","vA");
    vaultB=await deploy("LQCLiquidityVault","vault/LQCLiquidityVault",owner,await vaultA.getAddress(),await owner.getAddress(),ethers.parseEther("1000000"),"Vault B","vB");
    validator=await deploy("LQCCompositePlan","intent-v1/LQCCompositePlan",owner);registry=await deploy("LQCCompositeAdapterRegistry","intent-v1/LQCCompositeAdapterRegistry",owner,await owner.getAddress(),await outsider.getAddress());
    executor=await deploy("LQCCompositeExecutor","intent-v1/LQCCompositeExecutor",owner,await owner.getAddress(),await validator.getAddress(),await registry.getAddress());
    adapterA=await deploy("LQCCompositeVaultAdapter","intent-v1/LQCCompositeVaultAdapter",owner,await executor.getAddress(),await vaultA.getAddress());adapterB=await deploy("LQCCompositeVaultAdapter","intent-v1/LQCCompositeVaultAdapter",owner,await executor.getAddress(),await vaultB.getAddress());
    await(await registry.registerAdapter(await adapterA.getAddress(),1)).wait();await(await registry.registerAdapter(await adapterB.getAddress(),1)).wait();
  });

  async function plan(overrides={}){
    const amount=ethers.parseEther("10"),finalAmount=amount-2000n,deadline=BigInt((await owner.provider.getBlock("latest")).timestamp+300),actions=[
      {kind:1,adapter:await adapterA.getAddress(),tokenIn:await token.getAddress(),tokenOut:await vaultA.getAddress(),minAmountOut:amount-1000n,dataHash:emptyHash},
      {kind:1,adapter:await adapterB.getAddress(),tokenIn:await vaultA.getAddress(),tokenOut:await vaultB.getAddress(),minAmountOut:finalAmount,dataHash:emptyHash}
    ];return{amount,finalAmount,deadline,actions,payloads:["0x","0x"],...overrides};
  }
  async function execute(value){return executor.execute(intentHash,await token.getAddress(),value.amount,await vaultB.getAddress(),await user.getAddress(),value.finalAmount,value.deadline,value.actions,value.payloads)}

  it("atomically deposits through two reviewed Vault actions",async function(){
    const value=await plan();await(await token.mint(await executor.getAddress(),value.amount)).wait();const [expectedHash]=await validator.validateAndHash(intentHash,await token.getAddress(),await vaultB.getAddress(),await user.getAddress(),value.finalAmount,value.deadline,value.actions);
    await(await execute(value)).wait();assert.equal(await vaultB.balanceOf(await user.getAddress()),value.finalAmount);assert.equal(await executor.planUsed(expectedHash),true);assert.equal(await token.balanceOf(await executor.getAddress()),0n);assert.equal(await vaultA.balanceOf(await executor.getAddress()),0n);assert.equal(await vaultB.balanceOf(await executor.getAddress()),0n);
  });

  it("rejects unauthorized callers and plan replay",async function(){
    const value=await plan();await(await token.mint(await executor.getAddress(),value.amount)).wait();await assert.rejects(executor.connect(outsider).execute(intentHash,await token.getAddress(),value.amount,await vaultB.getAddress(),await user.getAddress(),value.finalAmount,value.deadline,value.actions,value.payloads));await(await execute(value)).wait();await(await token.mint(await executor.getAddress(),value.amount)).wait();await assert.rejects(execute(value));
  });

  it("rolls every earlier action back when a later adapter is disabled",async function(){
    const value=await plan();await(await token.mint(await executor.getAddress(),value.amount)).wait();await(await registry.connect(outsider).setAdapterEnabled(await adapterB.getAddress(),false)).wait();await assert.rejects(execute(value));assert.equal(await token.balanceOf(await executor.getAddress()),value.amount);assert.equal(await vaultA.totalAssets(),0n);assert.equal(await vaultB.totalAssets(),0n);assert.equal(await vaultA.balanceOf(await executor.getAddress()),0n);
  });

  it("rejects payload substitution, insufficient output and residual source funds",async function(){
    let value=await plan();await(await token.mint(await executor.getAddress(),value.amount)).wait();await assert.rejects(execute({...value,payloads:["0x01","0x"]}));
    value=await plan();value.actions[1].minAmountOut=value.finalAmount+1n;value.finalAmount+=1n;await assert.rejects(execute(value));
    await(await token.mint(await executor.getAddress(),1n)).wait();value=await plan();await assert.rejects(execute(value));
  });
});
