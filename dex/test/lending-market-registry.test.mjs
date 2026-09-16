import assert from "node:assert/strict";
import fs from "node:fs";
import ganache from "ganache";
import { ethers } from "ethers";

const artifact=(name,source)=>JSON.parse(fs.readFileSync(new URL(`../artifacts/contracts/${source}.sol/${name}.json`,import.meta.url)));

describe("LQC Lending isolated market registry",function(){
  this.timeout(30000);
  let owner,guardian,outsider,collateral,debt,oracle,registry,primaryCollateral,secondaryCollateral,primaryDebt,secondaryDebt;
  const deploy=async(name,source,signer,...args)=>{const a=artifact(name,source),c=await new ethers.ContractFactory(a.abi,a.bytecode,signer).deploy(...args);await c.waitForDeployment();return c};
  beforeEach(async function(){
    const provider=new ethers.BrowserProvider(ganache.provider({logging:{quiet:true}}));
    owner=await provider.getSigner(0);guardian=await provider.getSigner(1);outsider=await provider.getSigner(2);
    collateral=await deploy("MockERC20","mocks/MockERC20",owner,"Collateral","COL");
    debt=await deploy("MockERC20","mocks/MockERC20",owner,"Debt USD","DUSD");
    primaryCollateral=await deploy("MockPriceFeed","mocks/MockPriceFeed",owner,8,100_00000000n);
    secondaryCollateral=await deploy("MockPriceFeed","mocks/MockPriceFeed",owner,8,99_00000000n);
    primaryDebt=await deploy("MockPriceFeed","mocks/MockPriceFeed",owner,8,1_00000000n);
    secondaryDebt=await deploy("MockPriceFeed","mocks/MockPriceFeed",owner,8,1_01000000n);
    oracle=await deploy("LQCOracleManager","lending/LQCOracleManager",owner,await owner.getAddress(),await guardian.getAddress());
    await(await oracle.configureAsset(await collateral.getAddress(),await primaryCollateral.getAddress(),await secondaryCollateral.getAddress(),3600,200)).wait();
    await(await oracle.configureAsset(await debt.getAddress(),await primaryDebt.getAddress(),await secondaryDebt.getAddress(),3600,200)).wait();
    registry=await deploy("LQCLendingMarketRegistry","lending/LQCLendingMarketRegistry",owner,await owner.getAddress(),await guardian.getAddress(),await oracle.getAddress());
  });
  const config=(overrides={})=>({collateralAsset:collateral.target,debtAsset:debt.target,collateralDecimals:18,debtDecimals:18,maxLtvBps:5000,liquidationThresholdBps:7000,liquidationBonusBps:500,supplyCap:ethers.parseEther("1000000"),borrowCap:ethers.parseEther("400000"),minBorrow:ethers.parseEther("10"),enabled:true,...overrides});
  const configure=async(overrides={})=>{await(await registry.configureMarket(config(overrides))).wait();return registry.marketId(collateral.target,debt.target)};

  it("enforces the 50 percent LTV and conservative oracle prices",async function(){
    const id=await configure();
    const safe=await registry.accountRisk(id,ethers.parseEther("1"),ethers.parseEther("49"));
    assert.equal(safe.collateralValue,ethers.parseEther("99"));
    assert.equal(safe.debtValue,ethers.parseEther("49.49"));
    assert.equal(safe.borrowAllowed,true);assert.equal(safe.liquidatable,false);
    const excessive=await registry.accountRisk(id,ethers.parseEther("1"),ethers.parseEther("50"));
    assert.equal(excessive.borrowAllowed,false);assert.equal(excessive.liquidatable,false);
  });

  it("separates borrow rejection from liquidation and reports health factor",async function(){
    const id=await configure();
    const warning=await registry.accountRisk(id,ethers.parseEther("1"),ethers.parseEther("60"));
    assert.equal(warning.borrowAllowed,false);assert.equal(warning.liquidatable,false);assert.ok(warning.healthFactor>1_000_000_000_000_000_000n);
    const unsafe=await registry.accountRisk(id,ethers.parseEther("1"),ethers.parseEther("70"));
    assert.equal(unsafe.liquidatable,true);assert.ok(unsafe.healthFactor<1_000_000_000_000_000_000n);
  });

  it("rejects unsafe parameters and enforces supply and borrow caps",async function(){
    await assert.rejects(registry.configureMarket(config({maxLtvBps:5001})));
    await assert.rejects(registry.configureMarket(config({liquidationThresholdBps:5000})));
    await assert.rejects(registry.connect(outsider).configureMarket(config()));
    const id=await configure();
    await registry.validateCaps(id,ethers.parseEther("1000000"),ethers.parseEther("400000"));
    await assert.rejects(registry.validateCaps(id,ethers.parseEther("1000001"),0));
    await assert.rejects(registry.validateCaps(id,0,ethers.parseEther("400001")));
    await registry.validateCaps(id,0,ethers.parseEther("1"));
    await assert.rejects(registry.validateBorrowAmount(id,ethers.parseEther("1")));
  });

  it("lets the guardian disable immediately but only governance recover",async function(){
    const id=await configure();
    await assert.rejects(registry.connect(outsider).setMarketEnabled(id,false));
    await(await registry.connect(guardian).setMarketEnabled(id,false)).wait();
    await assert.rejects(registry.validateCaps(id,ethers.parseEther("1"),0));
    assert.equal((await registry.accountRisk(id,ethers.parseEther("1"),0)).borrowAllowed,true);
    await assert.rejects(registry.connect(guardian).setMarketEnabled(id,true));
    await(await registry.setMarketEnabled(id,true)).wait();
    assert.equal((await registry.accountRisk(id,ethers.parseEther("1"),0)).borrowAllowed,true);
  });
});
