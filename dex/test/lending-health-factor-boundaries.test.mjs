import assert from "node:assert/strict";
import fs from "node:fs";
import ganache from "./support/anvil-compat.mjs";
import { ethers } from "ethers";

const artifact=(name,source)=>JSON.parse(fs.readFileSync(new URL(`../artifacts/contracts/${source}.sol/${name}.json`,import.meta.url)));

describe("Master 6/9 Health Factor runtime boundaries",function(){
  this.timeout(30000);
  let provider,owner,guardian,collateral,debt,registry,id;
  const deploy=async(name,source,signer,...args)=>{
    const a=artifact(name,source);
    const c=await new ethers.ContractFactory(a.abi,a.bytecode,signer).deploy(...args);
    await c.waitForDeployment();
    return c;
  };

  beforeEach(async()=>{
    provider=new ethers.BrowserProvider(ganache.provider({logging:{quiet:true}}));
    owner=await provider.getSigner(0);
    guardian=await provider.getSigner(1);

    collateral=await deploy("MockERC20","mocks/MockERC20",owner,"COL","COL");
    debt=await deploy("MockERC20","mocks/MockERC20",owner,"DEBT","DEBT");

    const cp=await deploy("MockPriceFeed","mocks/MockPriceFeed",owner,8,100_00000000n);
    const cs=await deploy("MockPriceFeed","mocks/MockPriceFeed",owner,8,100_00000000n);
    const dp=await deploy("MockPriceFeed","mocks/MockPriceFeed",owner,8,1_00000000n);
    const ds=await deploy("MockPriceFeed","mocks/MockPriceFeed",owner,8,1_00000000n);

    const oracle=await deploy("LQCOracleManager","lending/LQCOracleManager",owner,owner.address,guardian.address);
    await(await oracle.configureAsset(collateral.target,cp.target,cs.target,3600,200)).wait();
    await(await oracle.configureAsset(debt.target,dp.target,ds.target,3600,200)).wait();

    registry=await deploy("LQCLendingMarketRegistry","lending/LQCLendingMarketRegistry",owner,owner.address,guardian.address,oracle.target);
    await(await registry.configureMarket({
      collateralAsset:collateral.target,
      debtAsset:debt.target,
      collateralDecimals:18,
      debtDecimals:18,
      maxLtvBps:5000,
      liquidationThresholdBps:7000,
      liquidationBonusBps:500,
      supplyCap:ethers.parseEther("1000"),
      borrowCap:ethers.parseEther("500"),
      minBorrow:ethers.parseEther("10"),
      enabled:true
    })).wait();
    id=await registry.marketId(collateral.target,debt.target);
  });

  it("returns infinite Health Factor for a debt-free account",async()=>{
    const risk=await registry.accountRisk(id,ethers.parseEther("2"),0n);
    assert.equal(risk.healthFactor,ethers.MaxUint256);
    assert.equal(risk.borrowAllowed,true);
    assert.equal(risk.liquidatable,false);
  });

  it("separates the 50 percent borrow boundary from the 70 percent liquidation boundary",async()=>{
    const safe=await registry.accountRisk(id,ethers.parseEther("2"),ethers.parseEther("100"));
    assert.equal(safe.collateralValue,ethers.parseEther("200"));
    assert.equal(safe.maxDebtValue,ethers.parseEther("100"));
    assert.equal(safe.liquidationDebtValue,ethers.parseEther("140"));
    assert.equal(safe.healthFactor,ethers.parseEther("1.4"));
    assert.equal(safe.borrowAllowed,true);
    assert.equal(safe.liquidatable,false);

    const buffer=await registry.accountRisk(id,ethers.parseEther("2"),ethers.parseEther("101"));
    assert.equal(buffer.borrowAllowed,false);
    assert.equal(buffer.liquidatable,false);
    assert.ok(buffer.healthFactor>ethers.parseEther("1"));
  });

  it("treats Health Factor 1 as the boundary and only below 1 as liquidatable",async()=>{
    const boundary=await registry.accountRisk(id,ethers.parseEther("2"),ethers.parseEther("140"));
    assert.equal(boundary.healthFactor,ethers.parseEther("1"));
    assert.equal(boundary.borrowAllowed,false);
    assert.equal(boundary.liquidatable,false);

    const breached=await registry.accountRisk(id,ethers.parseEther("2"),ethers.parseEther("141"));
    assert.ok(breached.healthFactor<ethers.parseEther("1"));
    assert.equal(breached.borrowAllowed,false);
    assert.equal(breached.liquidatable,true);
  });

  it("rejects market configurations above the 50 percent protocol LTV ceiling",async()=>{
    await assert.rejects(registry.configureMarket({
      collateralAsset:collateral.target,
      debtAsset:debt.target,
      collateralDecimals:18,
      debtDecimals:18,
      maxLtvBps:5001,
      liquidationThresholdBps:7000,
      liquidationBonusBps:500,
      supplyCap:ethers.parseEther("1000"),
      borrowCap:ethers.parseEther("500"),
      minBorrow:ethers.parseEther("10"),
      enabled:true
    }));
  });
});
