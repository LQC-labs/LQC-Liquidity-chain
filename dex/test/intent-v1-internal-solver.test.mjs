import assert from "node:assert/strict";
import fs from "node:fs";
import ganache from "ganache";
import { ethers } from "ethers";

const artifact=(name,source=name)=>JSON.parse(fs.readFileSync(new URL(`../artifacts/contracts/${source}.sol/${name}.json`,import.meta.url)));

describe("LQC Intent v1 Router 2.0 internal solver",function(){
  this.timeout(30000);
  const mnemonic="test test test test test test test test test test test junk",types={Intent:[
    {name:"user",type:"address"},{name:"sourceChainId",type:"uint256"},{name:"sourceToken",type:"address"},{name:"sourceAmount",type:"uint256"},{name:"destinationChainId",type:"uint256"},{name:"destinationToken",type:"address"},{name:"recipient",type:"address"},{name:"minAmountOut",type:"uint256"},{name:"deadline",type:"uint256"},{name:"nonce",type:"uint256"},{name:"salt",type:"bytes32"}
  ]};
  let provider,owner,user,outsider,userWallet,tokenIn,tokenOut,flow,registry,execution,adapter,hub,solver,escrow,chainId,dexId,routeData;
  const deploy=async(name,source,signer,...args)=>{const a=artifact(name,source),contract=await new ethers.ContractFactory(a.abi,a.bytecode,signer).deploy(...args);await contract.waitForDeployment();return contract};

  beforeEach(async function(){
    provider=new ethers.BrowserProvider(ganache.provider({wallet:{mnemonic},chain:{chainId:31337},logging:{quiet:true}}));owner=await provider.getSigner(0);user=await provider.getSigner(1);outsider=await provider.getSigner(2);userWallet=ethers.HDNodeWallet.fromPhrase(mnemonic,undefined,"m/44'/60'/0'/0/1");chainId=(await provider.getNetwork()).chainId;
    tokenIn=await deploy("MockERC20","mocks/MockERC20",owner,"Input","IN");tokenOut=await deploy("MockERC20","mocks/MockERC20",owner,"Output","OUT");const wbnb=await deploy("MockWBNB","mocks/MockWBNB",owner),factory=await deploy("LQCFlowFactory","LQCFlowFactory",owner,await owner.getAddress());flow=await deploy("LQCFlowRouter","LQCFlowRouter",owner,await factory.getAddress(),await wbnb.getAddress());registry=await deploy("LQCDexRegistry","router-v2/LQCDexRegistry",owner,await owner.getAddress());execution=await deploy("LQCExecutionRouter","router-v2/LQCExecutionRouter",owner,await registry.getAddress(),ethers.ZeroAddress);adapter=await deploy("LQCFlowAdapter","router-v2/adapters/LQCFlowAdapter",owner,await flow.getAddress());dexId=ethers.id("LQC_FLOW");await(await registry.addDex(dexId,await adapter.getAddress(),"LQC Flow",100)).wait();
    const liquidity=ethers.parseEther("10000"),deadline=BigInt((await provider.getBlock("latest")).timestamp+3600);await(await tokenIn.mint(await owner.getAddress(),liquidity)).wait();await(await tokenOut.mint(await owner.getAddress(),liquidity)).wait();await(await tokenIn.approve(await flow.getAddress(),liquidity)).wait();await(await tokenOut.approve(await flow.getAddress(),liquidity)).wait();await(await flow.addLiquidity(await tokenIn.getAddress(),await tokenOut.getAddress(),liquidity,liquidity,0,0,await owner.getAddress(),deadline)).wait();
    hub=await deploy("LQCIntentHub","intent-v1/LQCIntentHub",owner,await owner.getAddress(),await owner.getAddress(),await outsider.getAddress());solver=await deploy("LQCInternalSolver","intent-v1/LQCInternalSolver",owner,await hub.getAddress(),await execution.getAddress(),await owner.getAddress());escrow=new ethers.Contract(await hub.sourceEscrow(),artifact("LQCSourceEscrow","intent-v1/LQCSourceEscrow").abi,provider);await assert.rejects(hub.setInternalSolver(await outsider.getAddress()));const wronglyBound=await deploy("LQCInternalSolver","intent-v1/LQCInternalSolver",owner,await outsider.getAddress(),await execution.getAddress(),await owner.getAddress());await assert.rejects(hub.setInternalSolver(await wronglyBound.getAddress()));await(await hub.setInternalSolver(await solver.getAddress())).wait();await assert.rejects(solver.connect(outsider).acceptHubRole());await(await solver.acceptHubRole()).wait();routeData=ethers.AbiCoder.defaultAbiCoder().encode(["address[]"],[[await tokenIn.getAddress(),await tokenOut.getAddress()]]);
  });

  async function submit(nonce,minOverride){
    const amountIn=ethers.parseEther("10"),quote=(await flow.getAmountsOut(amountIn,[await tokenIn.getAddress(),await tokenOut.getAddress()]))[1],block=await provider.getBlock("latest"),intent={user:await user.getAddress(),sourceChainId:chainId,sourceToken:await tokenIn.getAddress(),sourceAmount:amountIn,destinationChainId:chainId,destinationToken:await tokenOut.getAddress(),recipient:await user.getAddress(),minAmountOut:minOverride??quote*99n/100n,deadline:BigInt(block.timestamp+300),nonce:BigInt(nonce),salt:ethers.id(`same-chain-${nonce}`)};await(await tokenIn.mint(await user.getAddress(),amountIn)).wait();await(await tokenIn.connect(user).approve(await escrow.getAddress(),amountIn)).wait();const signature=await userWallet.signTypedData({name:"LQC Intent Hub",version:"1",chainId,verifyingContract:await hub.getAddress()},types,intent),hash=await hub.hashIntent(intent);await(await hub.submitIntent(intent,signature)).wait();return{intent,hash,quote};
  }

  it("atomically releases escrow, executes Router 2.0 and records the receipt",async function(){
    const{hash,quote}=await submit(1),before=await tokenOut.balanceOf(await user.getAddress());await assert.rejects(hub.connect(outsider).executeSameChainIntent(hash,dexId,routeData));await(await hub.executeSameChainIntent(hash,dexId,routeData)).wait();const record=await hub.getIntent(hash),deposit=await escrow.getDeposit(hash);assert.equal(record.status,2n);assert.equal(record.solver,await solver.getAddress());assert.equal(record.actualAmountOut,quote);assert.notEqual(record.executionHash,ethers.ZeroHash);assert.equal((await tokenOut.balanceOf(await user.getAddress()))-before,quote);assert.equal(deposit.active,false);assert.equal(await tokenIn.balanceOf(await solver.getAddress()),0n);assert.equal(await tokenIn.allowance(await solver.getAddress(),await execution.getAddress()),0n);
  });

  it("rolls escrow release and status back when Router execution cannot meet minimum output",async function(){
    const amountIn=ethers.parseEther("10"),quote=(await flow.getAmountsOut(amountIn,[await tokenIn.getAddress(),await tokenOut.getAddress()]))[1],{hash}=await submit(2,quote+1n);await assert.rejects(hub.executeSameChainIntent(hash,dexId,routeData));assert.equal((await hub.getIntent(hash)).status,1n);assert.equal((await escrow.getDeposit(hash)).active,true);assert.equal(await tokenIn.balanceOf(await escrow.getAddress()),amountIn);assert.equal(await tokenIn.balanceOf(await solver.getAddress()),0n);
  });
});
