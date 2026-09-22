import assert from "node:assert/strict";
import fs from "node:fs";
import ganache from "./support/anvil-compat.mjs";
import { ethers } from "ethers";

const artifact=(name,source)=>JSON.parse(
  fs.readFileSync(new URL(`../artifacts/contracts/${source}.sol/${name}.json`,import.meta.url))
);
const deploy=async(signer,name,source,args=[])=>{
  const a=artifact(name,source);
  const c=await new ethers.ContractFactory(a.abi,a.bytecode,signer).deploy(...args);
  await c.waitForDeployment();
  return c;
};

describe("Master 7/5-4 Futures Insurance and residual bad debt accounting",function(){
  this.timeout(30000);
  let provider,owner,trader,outsider,collateral,indexToken,oracle,registry,vault,engine;
  const usd=ethers.parseEther;

  async function setPrice(value){
    await(await oracle.setPrice(await indexToken.getAddress(),usd(value),{gasLimit:100_000n})).wait();
  }

  async function openWithInsuranceFee({feeBps=1000n,insuranceShareBps=10000n,coverageBps=10000n}={}){
    await(await engine.configureTradingFee(1,feeBps,insuranceShareBps)).wait();
    await(await engine.configureInsuranceCoverage(1,coverageBps)).wait();
    await(await engine.connect(trader).openPosition(1,usd("1000"),usd("5000"),true)).wait();
    // Isolate the close/deficit accounting from any second trading fee.
    await(await engine.configureTradingFee(1,0,0)).wait();
  }

  beforeEach(async function(){
    provider=new ethers.BrowserProvider(ganache.provider({logging:{quiet:true},wallet:{totalAccounts:5}}));
    owner=await provider.getSigner(0);
    trader=await provider.getSigner(1);
    outsider=await provider.getSigner(2);

    collateral=await deploy(owner,"MockERC20","mocks/MockERC20",["Mock USDT","mUSDT"]);
    indexToken=await deploy(owner,"MockERC20","mocks/MockERC20",["Mock BTC","mBTC"]);
    oracle=await deploy(owner,"MockLQCFuturesOracle","futures/mocks/MockLQCFuturesOracle");
    registry=await deploy(owner,"LQCFuturesMarketRegistry","futures/LQCFuturesMarketRegistry",[await owner.getAddress()]);
    vault=await deploy(owner,"LQCFuturesVault","futures/LQCFuturesVault",[await owner.getAddress()]);
    engine=await deploy(owner,"LQCPerpEngine","futures/LQCPerpEngine",[await registry.getAddress(),await vault.getAddress()]);

    await(await vault.setEngine(await engine.getAddress())).wait();
    await(await vault.setSupportedCollateral(await collateral.getAddress(),true)).wait();
    await(await registry.addMarket(
      ethers.encodeBytes32String("BTC/USDT"),
      await indexToken.getAddress(),
      await collateral.getAddress(),
      await oracle.getAddress(),
      100_000,
      500
    )).wait();
    await setPrice("50000");

    const traderAddress=await trader.getAddress();
    await(await collateral.mint(traderAddress,usd("10000"))).wait();
    await(await collateral.connect(trader).approve(await vault.getAddress(),ethers.MaxUint256)).wait();
    await(await vault.connect(trader).deposit(await collateral.getAddress(),usd("5000"))).wait();
  });

  it("covers a full-close deficit from the segregated Insurance reserve when Governance permits 100%",async function(){
    const token=await collateral.getAddress();
    await openWithInsuranceFee();

    assert.equal(await vault.insuranceFeeReserve(token),usd("500"));
    await setPrice("35000"); // -1,500 PnL against 1,000 margin => 500 deficit
    await(await engine.connect(trader).closePosition(1)).wait();

    assert.equal(await vault.totalInsuranceCovered(token),usd("500"));
    assert.equal(await vault.insuranceFeeReserve(token),0n);
    assert.equal(await vault.residualBadDebt(token),0n);
    assert.equal(await vault.isFullyBacked(token),true);
    assert.equal(await vault.isSolvent(token),true);
  });

  it("enforces the Governance per-market coverage bound and records the uncovered remainder",async function(){
    const token=await collateral.getAddress();
    await openWithInsuranceFee({coverageBps:5000n});

    await setPrice("35000");
    await(await engine.connect(trader).closePosition(1)).wait();

    assert.equal(await vault.totalInsuranceCovered(token),usd("250"));
    assert.equal(await vault.insuranceFeeReserve(token),usd("250"));
    assert.equal(await vault.residualBadDebt(token),usd("250"));
    assert.equal(await vault.isFullyBacked(token),true);
    assert.equal(await vault.isSolvent(token),false);
  });

  it("never spends Treasury reserve to cover Futures bad debt",async function(){
    const token=await collateral.getAddress();
    await openWithInsuranceFee({insuranceShareBps:5000n,coverageBps:10000n});

    assert.equal(await vault.insuranceFeeReserve(token),usd("250"));
    assert.equal(await vault.treasuryFeeReserve(token),usd("250"));

    await setPrice("35000");
    await(await engine.connect(trader).closePosition(1)).wait();

    assert.equal(await vault.totalInsuranceCovered(token),usd("250"));
    assert.equal(await vault.insuranceFeeReserve(token),0n);
    assert.equal(await vault.treasuryFeeReserve(token),usd("250"));
    assert.equal(await vault.residualBadDebt(token),usd("250"));
  });

  it("records the entire deficit when Insurance coverage is disabled",async function(){
    const token=await collateral.getAddress();
    await openWithInsuranceFee({coverageBps:0n});

    await setPrice("35000");
    await(await engine.connect(trader).closePosition(1)).wait();

    assert.equal(await vault.totalInsuranceCovered(token),0n);
    assert.equal(await vault.insuranceFeeReserve(token),usd("500"));
    assert.equal(await vault.residualBadDebt(token),usd("500"));
  });

  it("keeps bad-debt spending engine-only and coverage configuration Governance-only",async function(){
    const token=await collateral.getAddress();

    await assert.rejects(vault.coverBadDebt(token,usd("1"),usd("1")));
    await assert.rejects(vault.connect(outsider).coverBadDebt(token,usd("1"),usd("1")));
    await assert.rejects(engine.connect(trader).configureInsuranceCoverage(1,10000));
    await assert.rejects(engine.configureInsuranceCoverage(1,10001));
  });

  it("does not create bad debt when realized loss stays inside locked margin",async function(){
    const token=await collateral.getAddress();
    await openWithInsuranceFee();
    await setPrice("45000"); // -500 PnL, fully inside margin

    await(await engine.connect(trader).closePosition(1)).wait();

    assert.equal(await vault.residualBadDebt(token),0n);
    assert.equal(await vault.totalInsuranceCovered(token),0n);
    assert.equal(await vault.insuranceFeeReserve(token),usd("500"));
  });

  it("keeps Insurance and bad debt inside Futures without Lending or Staking dependencies",function(){
    const engineSource=fs.readFileSync(new URL("../contracts/futures/LQCPerpEngine.sol",import.meta.url),"utf8");
    const vaultSource=fs.readFileSync(new URL("../contracts/futures/LQCFuturesVault.sol",import.meta.url),"utf8");

    for(const source of[engineSource,vaultSource]){
      assert.ok(!source.includes("LQCLendingCore"));
      assert.ok(!source.includes("LQCStaking"));
    }
    assert.ok(vaultSource.includes("residualBadDebt"));
    assert.ok(vaultSource.includes("insuranceFeeReserve"));
  });
});
