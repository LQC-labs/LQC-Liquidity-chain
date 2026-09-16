import assert from "node:assert/strict";
import fs from "node:fs";
import ganache from "ganache";
import { ethers } from "ethers";

const artifact=(name,source)=>JSON.parse(fs.readFileSync(new URL(`../artifacts/contracts/${source}.sol/${name}.json`,import.meta.url)));

describe("LQC Intent v1 Router-to-Vault composite execution",function(){
  this.timeout(30000);
  let owner,user,guardian,tokenIn,tokenOut,flow,dexRegistry,executionRouter,vault,validator,registry,executor,routerAdapter,vaultAdapter,dexId,routeData;
  const deploy=async(name,source,signer,...args)=>{const a=artifact(name,source),c=await new ethers.ContractFactory(a.abi,a.bytecode,signer).deploy(...args);await c.waitForDeployment();return c};
  const intentHash=ethers.id("router-vault-composite");

  beforeEach(async function(){
    const provider=new ethers.BrowserProvider(ganache.provider({logging:{quiet:true}}));owner=await provider.getSigner(0);user=await provider.getSigner(1);guardian=await provider.getSigner(2);
    tokenIn=await deploy("MockERC20","mocks/MockERC20",owner,"Input","IN");tokenOut=await deploy("MockERC20","mocks/MockERC20",owner,"Output","OUT");const wbnb=await deploy("MockWBNB","mocks/MockWBNB",owner),factory=await deploy("LQCFlowFactory","LQCFlowFactory",owner,await owner.getAddress());flow=await deploy("LQCFlowRouter","LQCFlowRouter",owner,await factory.getAddress(),await wbnb.getAddress());dexRegistry=await deploy("LQCDexRegistry","router-v2/LQCDexRegistry",owner,await owner.getAddress());executionRouter=await deploy("LQCExecutionRouter","router-v2/LQCExecutionRouter",owner,await dexRegistry.getAddress(),ethers.ZeroAddress);const flowAdapter=await deploy("LQCFlowAdapter","router-v2/adapters/LQCFlowAdapter",owner,await flow.getAddress());dexId=ethers.id("LQC_FLOW");await(await dexRegistry.addDex(dexId,await flowAdapter.getAddress(),"LQC Flow",100)).wait();
    const liquidity=ethers.parseEther("10000"),deadline=BigInt((await provider.getBlock("latest")).timestamp+3600);await(await tokenIn.mint(await owner.getAddress(),liquidity)).wait();await(await tokenOut.mint(await owner.getAddress(),liquidity)).wait();await(await tokenIn.approve(await flow.getAddress(),liquidity)).wait();await(await tokenOut.approve(await flow.getAddress(),liquidity)).wait();await(await flow.addLiquidity(await tokenIn.getAddress(),await tokenOut.getAddress(),liquidity,liquidity,0,0,await owner.getAddress(),deadline)).wait();routeData=ethers.AbiCoder.defaultAbiCoder().encode(["address[]"],[[await tokenIn.getAddress(),await tokenOut.getAddress()]]);
    vault=await deploy("LQCLiquidityVault","vault/LQCLiquidityVault",owner,await tokenOut.getAddress(),await owner.getAddress(),ethers.parseEther("1000000"),"Output Vault","vOUT");validator=await deploy("LQCCompositePlan","intent-v1/LQCCompositePlan",owner);registry=await deploy("LQCCompositeAdapterRegistry","intent-v1/LQCCompositeAdapterRegistry",owner,await owner.getAddress(),await guardian.getAddress());executor=await deploy("LQCCompositeExecutor","intent-v1/LQCCompositeExecutor",owner,await owner.getAddress(),await validator.getAddress(),await registry.getAddress());routerAdapter=await deploy("LQCCompositeRouterAdapter","intent-v1/LQCCompositeRouterAdapter",owner,await executor.getAddress(),await executionRouter.getAddress());vaultAdapter=await deploy("LQCCompositeVaultAdapter","intent-v1/LQCCompositeVaultAdapter",owner,await executor.getAddress(),await vault.getAddress());await(await registry.registerAdapter(await routerAdapter.getAddress(),0)).wait();await(await registry.registerAdapter(await vaultAdapter.getAddress(),1)).wait();
  });

  async function plan(overrides={}){
    const amount=ethers.parseEther("10"),quote=(await flow.getAmountsOut(amount,[await tokenIn.getAddress(),await tokenOut.getAddress()]))[1],deadline=BigInt((await owner.provider.getBlock("latest")).timestamp+300),swapPayload=ethers.AbiCoder.defaultAbiCoder().encode(["bytes32","uint256","bytes"],[dexId,deadline,routeData]),finalAmount=quote-1000n,actions=[
      {kind:0,adapter:await routerAdapter.getAddress(),tokenIn:await tokenIn.getAddress(),tokenOut:await tokenOut.getAddress(),minAmountOut:quote*99n/100n,dataHash:ethers.keccak256(swapPayload)},
      {kind:1,adapter:await vaultAdapter.getAddress(),tokenIn:await tokenOut.getAddress(),tokenOut:await vault.getAddress(),minAmountOut:finalAmount,dataHash:ethers.keccak256("0x")}
    ];return{amount,quote,deadline,swapPayload,finalAmount,actions,payloads:[swapPayload,"0x"],...overrides};
  }
  async function execute(value){return executor.execute(intentHash,await tokenIn.getAddress(),value.amount,await vault.getAddress(),await user.getAddress(),value.finalAmount,value.deadline,value.actions,value.payloads)}

  it("atomically swaps through Router 2.0 and deposits the output into Vault",async function(){
    const value=await plan();await(await tokenIn.mint(await executor.getAddress(),value.amount)).wait();await(await execute(value)).wait();assert.equal(await vault.balanceOf(await user.getAddress()),value.finalAmount);assert.equal(await tokenIn.balanceOf(await executor.getAddress()),0n);assert.equal(await tokenOut.balanceOf(await executor.getAddress()),0n);assert.equal(await tokenIn.balanceOf(await routerAdapter.getAddress()),0n);assert.equal(await tokenIn.allowance(await routerAdapter.getAddress(),await executionRouter.getAddress()),0n);
  });

  it("rejects route payload substitution before moving funds",async function(){
    const value=await plan();await(await tokenIn.mint(await executor.getAddress(),value.amount)).wait();value.payloads[0]=ethers.AbiCoder.defaultAbiCoder().encode(["bytes32","uint256","bytes"],[ethers.id("OTHER"),value.deadline,routeData]);await assert.rejects(execute(value));assert.equal(await tokenIn.balanceOf(await executor.getAddress()),value.amount);assert.equal(await vault.totalAssets(),0n);
  });

  it("rolls the swap back when the later Vault minimum cannot be met",async function(){
    const value=await plan();await(await tokenIn.mint(await executor.getAddress(),value.amount)).wait();value.actions[1].minAmountOut=value.finalAmount+1n;value.finalAmount+=1n;const reservesBefore=await flow.getAmountsOut(value.amount,[await tokenIn.getAddress(),await tokenOut.getAddress()]);await assert.rejects(execute(value));const reservesAfter=await flow.getAmountsOut(value.amount,[await tokenIn.getAddress(),await tokenOut.getAddress()]);assert.deepEqual(Array.from(reservesAfter),Array.from(reservesBefore));assert.equal(await tokenIn.balanceOf(await executor.getAddress()),value.amount);assert.equal(await vault.totalAssets(),0n);
  });

  it("fails closed when the underlying DEX is disabled",async function(){
    const value=await plan();await(await tokenIn.mint(await executor.getAddress(),value.amount)).wait();await(await dexRegistry.setDexEnabled(dexId,false)).wait();await assert.rejects(execute(value));assert.equal(await tokenIn.balanceOf(await executor.getAddress()),value.amount);assert.equal(await vault.totalAssets(),0n);
  });
});
