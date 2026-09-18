import assert from "node:assert/strict";
import fs from "node:fs";
import ganache from "ganache";
import { ethers } from "ethers";

const artifact=(name,source)=>JSON.parse(fs.readFileSync(new URL(`../artifacts/contracts/${source}.sol/${name}.json`,import.meta.url)));

describe("LQC Lending dual-feed oracle manager",function(){
  this.timeout(30000);
  let owner,guardian,outsider,asset,Oracle,Feed;
  beforeEach(async function(){
    const provider=new ethers.BrowserProvider(ganache.provider({logging:{quiet:true}}));
    owner=await provider.getSigner(0);guardian=await provider.getSigner(1);outsider=await provider.getSigner(2);
    asset=await outsider.getAddress();
    Oracle=new ethers.ContractFactory(artifact("LQCOracleManager","lending/LQCOracleManager").abi,artifact("LQCOracleManager","lending/LQCOracleManager").bytecode,owner);
    Feed=new ethers.ContractFactory(artifact("MockPriceFeed","mocks/MockPriceFeed").abi,artifact("MockPriceFeed","mocks/MockPriceFeed").bytecode,owner);
  });
  const deploy=async(primaryAnswer=100_00000000n,secondaryAnswer=101_00000000n)=>{
    const oracle=await Oracle.deploy(await owner.getAddress(),await guardian.getAddress());
    const primary=await Feed.deploy(8,primaryAnswer),secondary=await Feed.deploy(8,secondaryAnswer);
    await Promise.all([oracle.waitForDeployment(),primary.waitForDeployment(),secondary.waitForDeployment()]);
    await(await oracle.configureAsset(asset,await primary.getAddress(),await secondary.getAddress(),3600,200)).wait();
    return{oracle,primary,secondary};
  };

  it("values collateral low and debt high after validating both feeds",async function(){
    const{oracle}=await deploy();
    const[collateralPrice,debtPrice]=await oracle.getPrices(asset);
    assert.equal(collateralPrice,ethers.parseEther("100"));
    assert.equal(debtPrice,ethers.parseEther("101"));
  });

  it("fails closed for stale, invalid and excessively divergent prices",async function(){
    let value=await deploy(100_00000000n,130_00000000n);
    await assert.rejects(value.oracle.getPrices(asset));
    value=await deploy();
    await(await value.primary.setUpdatedAt(1,{gasLimit:100000n})).wait();
    await assert.rejects(value.oracle.getPrices(asset));
    await(await value.primary.setAnswer(0,{gasLimit:100000n})).wait();
    await assert.rejects(value.oracle.getPrices(asset));
  });

  it("lets the guardian disable but only governance re-enable an asset",async function(){
    const{oracle}=await deploy();
    await assert.rejects(oracle.connect(outsider).setAssetEnabled(asset,false));
    await(await oracle.connect(guardian).setAssetEnabled(asset,false)).wait();
    await assert.rejects(oracle.getPrices(asset));
    await assert.rejects(oracle.connect(guardian).setAssetEnabled(asset,true));
    await(await oracle.setAssetEnabled(asset,true)).wait();
    assert.equal((await oracle.getPrices(asset))[0],ethers.parseEther("100"));
  });

  it("restricts configuration and uses two-step governance transfer",async function(){
    const{oracle,primary,secondary}=await deploy();
    await assert.rejects(oracle.connect(outsider).configureAsset(asset,await primary.getAddress(),await secondary.getAddress(),3600,200));
    await assert.rejects(oracle.configureAsset(asset,await primary.getAddress(),await primary.getAddress(),3600,200));
    await(await oracle.transferOwnership(await outsider.getAddress())).wait();
    await assert.rejects(oracle.connect(guardian).acceptOwnership());
    await(await oracle.connect(outsider).acceptOwnership()).wait();
    assert.equal(await oracle.owner(),await outsider.getAddress());
  });
});
