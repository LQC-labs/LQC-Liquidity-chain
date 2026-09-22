import assert from "node:assert/strict";
import fs from "node:fs";
import ganache from "./support/anvil-compat.mjs";
import { ethers } from "ethers";

const artifact=(name,source)=>JSON.parse(fs.readFileSync(new URL(`../artifacts/contracts/${source}.sol/${name}.json`,import.meta.url)));
const deploy=async(signer,name,source,args=[])=>{const a=artifact(name,source);const c=await new ethers.ContractFactory(a.abi,a.bytecode,signer).deploy(...args);await c.waitForDeployment();return c;};

describe("Master 7/5-6 bounded ADL execution",function(){
  this.timeout(30000);
  let provider,owner,trader,other,collateral,indexToken,oracle,registry,vault,engine;
  const usd=ethers.parseEther;
  beforeEach(async function(){
    provider=new ethers.BrowserProvider(ganache.provider({logging:{quiet:true},wallet:{totalAccounts:5}}));
    owner=await provider.getSigner(0); trader=await provider.getSigner(1); other=await provider.getSigner(2);
    collateral=await deploy(owner,"MockERC20","mocks/MockERC20",["Mock USDT","mUSDT"]);
    indexToken=await deploy(owner,"MockERC20","mocks/MockERC20",["Mock BTC","mBTC"]);
    oracle=await deploy(owner,"MockLQCFuturesOracle","futures/mocks/MockLQCFuturesOracle");
    registry=await deploy(owner,"LQCFuturesMarketRegistry","futures/LQCFuturesMarketRegistry",[await owner.getAddress()]);
    vault=await deploy(owner,"LQCFuturesVault","futures/LQCFuturesVault",[await owner.getAddress()]);
    engine=await deploy(owner,"LQCPerpEngine","futures/LQCPerpEngine",[await registry.getAddress(),await vault.getAddress()]);
    await(await vault.setEngine(await engine.getAddress())).wait();
    await(await vault.setSupportedCollateral(await collateral.getAddress(),true)).wait();
    await(await registry.addMarket(ethers.encodeBytes32String("BTC/USDT"),await indexToken.getAddress(),await collateral.getAddress(),await oracle.getAddress(),100_000,500)).wait();
    await(await oracle.setPrice(await indexToken.getAddress(),usd("50000"),{gasLimit:100_000n})).wait();
    for(const s of[trader,other]){const a=await s.getAddress();await(await collateral.mint(a,usd("10000"))).wait();await(await collateral.connect(s).approve(await vault.getAddress(),ethers.MaxUint256)).wait();await(await vault.connect(s).deposit(await collateral.getAddress(),usd("5000"))).wait();}
  });

  async function createDebt(){
    await(await engine.configureInsuranceCoverage(1,0)).wait();
    await(await engine.connect(other).openPosition(1,usd("1000"),usd("5000"),true)).wait();
    await(await oracle.setPrice(await indexToken.getAddress(),usd("35000"),{gasLimit:100_000n})).wait();
    await(await engine.connect(other).closePosition(1)).wait();
  }

  it("rejects ADL when disabled or when caller is not Governance",async function(){
    await(await engine.connect(trader).openPosition(1,usd("1000"),usd("5000"),false)).wait();
    await createDebt();
    await assert.rejects(engine.executeAdl(await trader.getAddress(),1,usd("1000")));
    await(await engine.configureAdlSafety(1,true,2500)).wait();
    await assert.rejects(engine.connect(other).executeAdl(await trader.getAddress(),1,usd("1000")));
  });

  it("caps each ADL reduction and absorbs no more than recorded debt",async function(){
    const token=await collateral.getAddress();
    await(await engine.connect(trader).openPosition(1,usd("1000"),usd("5000"),false)).wait();
    await createDebt();
    const debtBefore=await vault.residualBadDebt(token);
    await(await engine.configureAdlSafety(1,true,2500)).wait();
    await assert.rejects(engine.executeAdl(await trader.getAddress(),1,usd("1300")));
    await(await engine.executeAdl(await trader.getAddress(),1,usd("1250"))).wait();
    const p=await engine.positions(await trader.getAddress(),1);
    assert.equal(p.sizeUsd,usd("3750"));
    assert.ok((await vault.residualBadDebt(token)) < debtBefore);
  });

  it("rejects non-profitable target slices",async function(){
    await(await engine.connect(trader).openPosition(1,usd("1000"),usd("5000"),true)).wait();
    await createDebt();
    await(await engine.configureAdlSafety(1,true,2500)).wait();
    await assert.rejects(engine.executeAdl(await trader.getAddress(),1,usd("1000")));
  });
});
