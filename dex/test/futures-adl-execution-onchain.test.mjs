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
    provider=new ethers.BrowserProvider(ganache.provider({logging:{quiet:true},wallet:{totalAccounts:5}}),undefined,{cacheTimeout:-1});
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
  it("FUT-06 collects pending funding before ADL shrinks payer notional",async function(){
    const account=await trader.getAddress(),token=await collateral.getAddress();
    await(await engine.connect(trader).openPosition(1,usd("1000"),usd("5000"),false)).wait();
    await createDebt();
    await(await engine.configureFunding(1,10n**25n)).wait();
    await(await engine.updateFundingIndex(1,-3n*10n**24n)).wait();
    await(await engine.configureAdlSafety(1,true,2500)).wait();
    const balance=await vault.availableBalance(account,token);
    await(await engine.executeAdl(account,1,usd("1250"))).wait();
    assert.equal(await vault.fundingPoolBalance(token),usd("15"));
    assert.equal(await vault.availableBalance(account,token),balance+usd("250")-usd("15"));
    assert.equal(await engine.previewFundingPayment(account,1),0n);
  });

  it("FUT-06 rejects ADL receiver settlement without collected pool funds",async function(){
    await(await engine.connect(trader).openPosition(1,usd("1000"),usd("5000"),false)).wait();
    await createDebt();
    await(await engine.configureFunding(1,10n**25n)).wait();
    await(await engine.updateFundingIndex(1,3n*10n**24n)).wait();
    await(await engine.configureAdlSafety(1,true,2500)).wait();
    await assert.rejects(engine.executeAdl(await trader.getAddress(),1,usd("1250")));
  });
  for(const sign of [-1n,1n])it(`FUT-06 archives full ADL ${sign<0n?"debt":"credit"} without transferring the fraction`,async function(){
    const account=await trader.getAddress(),token=await collateral.getAddress();
    await(await engine.connect(trader).openPosition(1,usd("1000"),usd("5000"),false)).wait();
    await createDebt();
    await(await engine.configureFunding(1,10n**25n)).wait();
    await(await engine.updateFundingIndex(1,sign*100000n)).wait();
    await(await engine.configureAdlSafety(1,true,10000)).wait();
    const balance=await vault.availableBalance(account,token);
    await(await engine.executeAdl(account,1,usd("5000"))).wait();
    assert.equal((await engine.positions(account,1)).open,false);
    const ledger=await engine.fundingLedgers(account,1);
    assert.equal(ledger.activeRemainderRay,0n);assert.equal(ledger.recognizedNetUnits,0n);
    assert.equal(sign>0n?ledger.closedCreditRay:ledger.closedDebtRay,(10n**27n)/2n);
    assert.equal(await vault.availableBalance(account,token),balance+usd("1000"));
    assert.equal(await vault.fundingPoolBalance(token),0n);
  });

  it("FUT-06 rolls back ADL size and bad debt when payer funding is unavailable",async function(){
    const account=await trader.getAddress(),token=await collateral.getAddress(),otherAccount=await other.getAddress();
    await(await engine.connect(trader).openPosition(1,usd("1000"),usd("5000"),false)).wait();
    await createDebt();
    await(await vault.connect(trader).withdraw(token,usd("4000"))).wait();
    await(await engine.configureFunding(1,10n**25n)).wait();
    await(await engine.updateFundingIndex(1,-3n*10n**24n)).wait();
    await(await engine.configureAdlSafety(1,true,2500)).wait();
    const position=Array.from(await engine.positions(account,1)),debt=await vault.residualBadDebt(token),balance=await vault.availableBalance(otherAccount,token);
    await assert.rejects(async()=>{await(await engine.executeAdl(account,1,usd("1250"),{gasLimit:3000000n})).wait();});
    assert.deepEqual(Array.from(await engine.positions(account,1)),position);
    assert.equal(await vault.residualBadDebt(token),debt);
    assert.equal(await vault.availableBalance(otherAccount,token),balance);
    assert.equal(await vault.fundingPoolBalance(token),0n);
    assert.equal(await engine.positionFundingEntryRay(account,1),0n);
    assert.deepEqual(Array.from(await engine.fundingLedgers(account,1)),[0n,0n,0n,0n]);
  });

  it("FUT-06 does not pay receiver funding twice when ADL follows explicit settlement",async function(){
    const account=await trader.getAddress(),token=await collateral.getAddress();
    await(await engine.connect(trader).openPosition(1,usd("1000"),usd("5000"),false)).wait();
    await createDebt();
    await(await engine.connect(other).openPosition(1,usd("1000"),usd("5000"),true)).wait();
    await(await engine.configureFunding(1,10n**25n)).wait();
    await(await engine.updateFundingIndex(1,3n*10n**24n)).wait();
    await(await engine.connect(other).settleFunding(1)).wait();
    await(await engine.connect(trader).settleFunding(1)).wait();
    const balance=await vault.availableBalance(account,token);
    await(await engine.configureAdlSafety(1,true,2500)).wait();
    await(await engine.executeAdl(account,1,usd("1250"))).wait();
    assert.equal(await vault.availableBalance(account,token),balance+usd("250"));
    assert.equal(await vault.fundingPoolBalance(token),0n);
  });
});
