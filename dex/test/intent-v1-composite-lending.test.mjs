import assert from "node:assert/strict";
import fs from "node:fs";
import ganache from "ganache";
import { ethers } from "ethers";

const artifact=(name,source)=>JSON.parse(fs.readFileSync(new URL(`../artifacts/contracts/${source}.sol/${name}.json`,import.meta.url)));

describe("LQC Intent v1 Composite Lending supply",function(){
  this.timeout(60000);
  const gas={gasLimit:1_500_000n},intentHash=ethers.id("router-lending-composite");
  let provider,owner,user,guardian,tokenIn,debt,collateral,flow,dexRegistry,executionRouter,validator,adapterRegistry,executor,routerAdapter,lendingAdapter,core,id,dexId,routeData;
  const deploy=async(name,source,signer,...args)=>{const a=artifact(name,source),c=await new ethers.ContractFactory(a.abi,a.bytecode,signer).deploy(...args);await c.waitForDeployment();return c};

  beforeEach(async function(){
    provider=new ethers.BrowserProvider(ganache.provider({logging:{quiet:true}}));owner=await provider.getSigner(0);user=await provider.getSigner(1);guardian=await provider.getSigner(2);
    tokenIn=await deploy("MockERC20","mocks/MockERC20",owner,"Input","IN");debt=await deploy("MockProofGatewayAttackToken","mocks/MockProofGatewayAttackToken",owner);collateral=await deploy("MockERC20","mocks/MockERC20",owner,"Collateral","COL");
    const wbnb=await deploy("MockWBNB","mocks/MockWBNB",owner),factory=await deploy("LQCFlowFactory","LQCFlowFactory",owner,owner.address);flow=await deploy("LQCFlowRouter","LQCFlowRouter",owner,factory.target,wbnb.target);dexRegistry=await deploy("LQCDexRegistry","router-v2/LQCDexRegistry",owner,owner.address);executionRouter=await deploy("LQCExecutionRouter","router-v2/LQCExecutionRouter",owner,dexRegistry.target,ethers.ZeroAddress);const flowAdapter=await deploy("LQCFlowAdapter","router-v2/adapters/LQCFlowAdapter",owner,flow.target);dexId=ethers.id("LQC_FLOW");await(await dexRegistry.addDex(dexId,flowAdapter.target,"LQC Flow",100)).wait();
    const liquidity=ethers.parseEther("10000"),deadline=BigInt((await provider.getBlock("latest")).timestamp+3600);await(await tokenIn.mint(owner.address,liquidity)).wait();await(await debt.mint(owner.address,liquidity)).wait();await(await tokenIn.approve(flow.target,liquidity)).wait();await(await debt.approve(flow.target,liquidity)).wait();await(await flow.addLiquidity(tokenIn.target,debt.target,liquidity,liquidity,0,0,owner.address,deadline)).wait();routeData=ethers.AbiCoder.defaultAbiCoder().encode(["address[]"],[[tokenIn.target,debt.target]]);
    const cp=await deploy("MockPriceFeed","mocks/MockPriceFeed",owner,8,100_00000000n),cs=await deploy("MockPriceFeed","mocks/MockPriceFeed",owner,8,99_00000000n),dp=await deploy("MockPriceFeed","mocks/MockPriceFeed",owner,8,1_00000000n),ds=await deploy("MockPriceFeed","mocks/MockPriceFeed",owner,8,1_01000000n),oracle=await deploy("LQCOracleManager","lending/LQCOracleManager",owner,owner.address,guardian.address);await(await oracle.configureAsset(collateral.target,cp.target,cs.target,3600,200)).wait();await(await oracle.configureAsset(debt.target,dp.target,ds.target,3600,200)).wait();
    const markets=await deploy("LQCLendingMarketRegistry","lending/LQCLendingMarketRegistry",owner,owner.address,guardian.address,oracle.target);await(await markets.configureMarket({collateralAsset:collateral.target,debtAsset:debt.target,collateralDecimals:18,debtDecimals:18,maxLtvBps:5000,liquidationThresholdBps:7000,liquidationBonusBps:500,supplyCap:ethers.parseEther("1000"),borrowCap:ethers.parseEther("900"),minBorrow:ethers.parseEther("10"),enabled:true})).wait();id=await markets.marketId(collateral.target,debt.target);const model=await deploy("LQCInterestRateModel","lending/LQCInterestRateModel",owner,owner.address,guardian.address);await(await model.configureRate(id,{baseAprBps:200,slope1AprBps:800,slope2AprBps:9000,optimalUtilizationBps:8000,reserveFactorBps:1000,enabled:true})).wait();const index=await deploy("LQCLendingInterestIndex","lending/LQCLendingInterestIndex",owner,owner.address,model.target);await(await index.initializeMarket(id)).wait();core=await deploy("LQCLendingCore","lending/LQCLendingCore",owner,owner.address,markets.target,index.target);await(await index.setCore(core.target)).wait();
    validator=await deploy("LQCCompositePlan","intent-v1/LQCCompositePlan",owner);adapterRegistry=await deploy("LQCCompositeAdapterRegistry","intent-v1/LQCCompositeAdapterRegistry",owner,owner.address,guardian.address);executor=await deploy("LQCCompositeExecutor","intent-v1/LQCCompositeExecutor",owner,owner.address,validator.target,adapterRegistry.target);routerAdapter=await deploy("LQCCompositeRouterAdapter","intent-v1/LQCCompositeRouterAdapter",owner,executor.target,executionRouter.target);lendingAdapter=await deploy("LQCCompositeLendingSupplyAdapter","intent-v1/LQCCompositeLendingSupplyAdapter",owner,executor.target,core.target,id,"LQC Debt Lending Position","lDEBT");await(await adapterRegistry.registerAdapter(routerAdapter.target,0)).wait();await(await adapterRegistry.registerAdapter(lendingAdapter.target,2)).wait();
  });

  async function plan(overrides={}){
    const amount=ethers.parseEther("10"),quote=(await flow.getAmountsOut(amount,[tokenIn.target,debt.target]))[1],deadline=BigInt((await provider.getBlock("latest")).timestamp+300),swapPayload=ethers.AbiCoder.defaultAbiCoder().encode(["bytes32","uint256","bytes"],[dexId,deadline,routeData]),lendingPayload=ethers.AbiCoder.defaultAbiCoder().encode(["bytes32"],[id]),minimum=quote*99n/100n,actions=[
      {kind:0,adapter:routerAdapter.target,tokenIn:tokenIn.target,tokenOut:debt.target,minAmountOut:minimum,dataHash:ethers.keccak256(swapPayload)},
      {kind:2,adapter:lendingAdapter.target,tokenIn:debt.target,tokenOut:lendingAdapter.target,minAmountOut:minimum,dataHash:ethers.keccak256(lendingPayload)}
    ];return{amount,quote,deadline,swapPayload,lendingPayload,minimum,actions,payloads:[swapPayload,lendingPayload],...overrides};
  }
  async function execute(value){return executor.execute(intentHash,tokenIn.target,value.amount,lendingAdapter.target,user.address,value.minimum,value.deadline,value.actions,value.payloads,gas)}
  async function waitForRevert(transaction){return (await transaction).wait()}

  it("atomically swaps and supplies into a transferable Lending position",async function(){
    const value=await plan();await(await tokenIn.mint(executor.target,value.amount)).wait();await(await execute(value)).wait();const receipts=await lendingAdapter.balanceOf(user.address);assert.ok(receipts>=value.minimum);assert.equal(await lendingAdapter.totalAssets(),receipts);assert.equal(await core.liquiditySharesOf(id,lendingAdapter.target),receipts);assert.equal(await tokenIn.balanceOf(executor.target),0n);assert.equal(await debt.balanceOf(executor.target),0n);assert.equal(await debt.balanceOf(lendingAdapter.target),0n);assert.equal(await debt.allowance(lendingAdapter.target,core.target),0n);
  });

  it("redeems the position receipt for the underlying Lending asset",async function(){
    const value=await plan();await(await tokenIn.mint(executor.target,value.amount)).wait();await(await execute(value)).wait();const receipts=await lendingAdapter.balanceOf(user.address),before=await debt.balanceOf(user.address);await(await lendingAdapter.connect(user).redeem(receipts,user.address,gas)).wait();assert.equal(await lendingAdapter.balanceOf(user.address),0n);assert.equal(await lendingAdapter.totalSupply(),0n);assert.equal(await core.liquidityOf(id,lendingAdapter.target),0n);assert.equal(await debt.balanceOf(user.address)-before,receipts);
  });

  it("rejects market payload substitution before Lending custody changes",async function(){
    const value=await plan();await(await tokenIn.mint(executor.target,value.amount)).wait();value.payloads[1]=ethers.AbiCoder.defaultAbiCoder().encode(["bytes32"],[ethers.id("OTHER")]);await assert.rejects(waitForRevert(execute(value)));assert.equal(await tokenIn.balanceOf(executor.target),value.amount);assert.equal(await lendingAdapter.totalAssets(),0n);assert.equal(await lendingAdapter.totalSupply(),0n);
  });

  it("rolls the swap back when Lending receipt minimum cannot be met",async function(){
    const value=await plan();await(await tokenIn.mint(executor.target,value.amount)).wait();value.actions[1].minAmountOut=value.quote+1n;value.minimum=value.quote+1n;const before=await flow.getAmountsOut(value.amount,[tokenIn.target,debt.target]);await assert.rejects(waitForRevert(execute(value)));const after=await flow.getAmountsOut(value.amount,[tokenIn.target,debt.target]);assert.deepEqual(Array.from(after),Array.from(before));assert.equal(await tokenIn.balanceOf(executor.target),value.amount);assert.equal(await lendingAdapter.totalAssets(),0n);
  });

  it("blocks direct callers and an unapproved Lending adapter",async function(){
    const value=await plan();await assert.rejects(waitForRevert(lendingAdapter.execute(debt.target,lendingAdapter.target,value.quote,value.minimum,value.lendingPayload)));await(await adapterRegistry.setAdapterEnabled(lendingAdapter.target,false)).wait();await(await tokenIn.mint(executor.target,value.amount)).wait();await assert.rejects(waitForRevert(execute(value)));assert.equal(await tokenIn.balanceOf(executor.target),value.amount);
  });

  it("blocks a debt-token callback reentrancy while completing the outer supply",async function(){
    const value=await plan(),callback=lendingAdapter.interface.encodeFunctionData("execute",[debt.target,lendingAdapter.target,value.quote,value.minimum,value.lendingPayload]);await(await debt.configureCallback(lendingAdapter.target,lendingAdapter.target,callback)).wait();await(await tokenIn.mint(executor.target,value.amount)).wait();await(await execute(value)).wait();assert.equal(await debt.callbackAttempted(),true);assert.equal(await debt.callbackSucceeded(),false);assert.equal(await debt.callbackRevertSelector(),lendingAdapter.interface.getError("Reentrancy").selector);assert.ok(await lendingAdapter.balanceOf(user.address)>=value.minimum);assert.equal(await debt.balanceOf(lendingAdapter.target),0n);
  });

  it("rolls the complete route back when approval cleanup creates malicious residual dust",async function(){
    const value=await plan();await(await debt.configureResidualDust(lendingAdapter.target,true)).wait();await(await tokenIn.mint(executor.target,value.amount)).wait();const before=await flow.getAmountsOut(value.amount,[tokenIn.target,debt.target]);await assert.rejects(waitForRevert(execute(value)));const after=await flow.getAmountsOut(value.amount,[tokenIn.target,debt.target]);assert.deepEqual(Array.from(after),Array.from(before));assert.equal(await tokenIn.balanceOf(executor.target),value.amount);assert.equal(await debt.balanceOf(lendingAdapter.target),0n);assert.equal(await lendingAdapter.totalAssets(),0n);assert.equal(await lendingAdapter.totalSupply(),0n);
  });
});
