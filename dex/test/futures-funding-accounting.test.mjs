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

describe("Master 7/5-2 Futures funding checkpoint accounting",function(){
  this.timeout(30000);

  let provider,owner,longTrader,shortTrader,third,collateral,indexToken,oracle,registry,vault,engine;
  const usd=ethers.parseEther;
  const RAY=10n**27n;
  const MAX_DELTA=10n**25n; // test configuration: 1%, not a protocol product constant
  const DELTA=3n*10n**24n; // test configuration: 0.3%

  async function setPrice(value){
    await(await oracle.setPrice(await indexToken.getAddress(),usd(value),{gasLimit:100_000n})).wait();
  }

  async function fundAndDeposit(signer,amount="5000"){
    const a=await signer.getAddress();
    await(await collateral.mint(a,usd(amount))).wait();
    await(await collateral.connect(signer).approve(await vault.getAddress(),ethers.MaxUint256)).wait();
    await(await vault.connect(signer).deposit(await collateral.getAddress(),usd(amount))).wait();
  }

  async function open(signer,isLong=true,margin="1000",size="5000"){
    await(await engine.connect(signer).openPosition(1,usd(margin),usd(size),isLong)).wait();
  }

  beforeEach(async function(){
    // A checkpoint can change gas needs between identical calls in one cache window.
    provider=new ethers.BrowserProvider(ganache.provider({logging:{quiet:true},wallet:{totalAccounts:6}}),undefined,{cacheTimeout:-1});
    owner=await provider.getSigner(0);
    longTrader=await provider.getSigner(1);
    shortTrader=await provider.getSigner(2);
    third=await provider.getSigner(3);

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

    await fundAndDeposit(longTrader);
    await fundAndDeposit(shortTrader);
    await fundAndDeposit(third);

    await(await engine.configureFunding(1,MAX_DELTA)).wait();
    await open(longTrader,true);
    await open(shortTrader,false);
  });

  it("conserves positive funding from long payer to short receiver through the dedicated pool",async function(){
    const longAddr=await longTrader.getAddress();
    const shortAddr=await shortTrader.getAddress();
    const token=await collateral.getAddress();

    await(await engine.updateFundingIndex(1,DELTA)).wait();

    assert.equal(await engine.previewFundingPayment(longAddr,1),-usd("15"));
    assert.equal(await engine.previewFundingPayment(shortAddr,1),usd("15"));

    const longBefore=await vault.availableBalance(longAddr,token);
    const shortBefore=await vault.availableBalance(shortAddr,token);
    const accountedBefore=await vault.totalAccounted(token);

    await(await engine.connect(longTrader).settleFunding(1)).wait();
    assert.equal(await vault.availableBalance(longAddr,token),longBefore-usd("15"));
    assert.equal(await vault.fundingPoolBalance(token),usd("15"));
    assert.equal(await vault.totalAccounted(token),accountedBefore-usd("15"));

    await(await engine.connect(shortTrader).settleFunding(1)).wait();
    assert.equal(await vault.availableBalance(shortAddr,token),shortBefore+usd("15"));
    assert.equal(await vault.fundingPoolBalance(token),0n);
    assert.equal(await vault.totalAccounted(token),accountedBefore);
    assert.equal(await vault.isFullyBacked(token),true);
  });

  it("fails closed if a receiver tries to consume funding before payers have funded the pool",async function(){
    const shortAddr=await shortTrader.getAddress();
    await(await engine.updateFundingIndex(1,DELTA)).wait();

    assert.equal(await engine.positionFundingEntryRay(shortAddr,1),0n);
    await assert.rejects(engine.connect(shortTrader).settleFunding(1));
    assert.equal(await engine.positionFundingEntryRay(shortAddr,1),0n);
    assert.equal(await vault.fundingPoolBalance(await collateral.getAddress()),0n);
  });

  it("reverses payer and receiver when cumulative funding moves negative",async function(){
    const longAddr=await longTrader.getAddress();
    const shortAddr=await shortTrader.getAddress();
    const token=await collateral.getAddress();

    await(await engine.updateFundingIndex(1,-DELTA)).wait();
    assert.equal(await engine.previewFundingPayment(shortAddr,1),-usd("15"));
    assert.equal(await engine.previewFundingPayment(longAddr,1),usd("15"));

    await(await engine.connect(shortTrader).settleFunding(1)).wait();
    assert.equal(await vault.fundingPoolBalance(token),usd("15"));
    await(await engine.connect(longTrader).settleFunding(1)).wait();
    assert.equal(await vault.fundingPoolBalance(token),0n);
  });

  it("uses a governance-supplied per-market bound and rejects unauthorized or excessive index updates",async function(){
    await assert.rejects(engine.connect(longTrader).configureFunding(1,MAX_DELTA));
    await assert.rejects(engine.connect(longTrader).updateFundingIndex(1,DELTA));
    await assert.rejects(engine.updateFundingIndex(1,MAX_DELTA+1n));
    await assert.rejects(engine.updateFundingIndex(1,0));
    await assert.rejects(engine.configureFunding(1,RAY+1n));
  });

  it("opens new positions at the current funding checkpoint with no retroactive funding",async function(){
    await(await engine.updateFundingIndex(1,DELTA)).wait();
    await open(third,true);

    const addr=await third.getAddress();
    assert.equal(await engine.positionFundingEntryRay(addr,1),DELTA);
    assert.equal(await engine.previewFundingPayment(addr,1),0n);
  });

  it("settles outstanding funding before voluntary reduction and future funding uses only remaining size",async function(){
    const addr=await longTrader.getAddress();
    const token=await collateral.getAddress();

    await(await engine.updateFundingIndex(1,DELTA)).wait();
    const availableBefore=await vault.availableBalance(addr,token);

    await(await engine.connect(longTrader).reducePosition(1,usd("2000"))).wait();

    const p=await engine.positions(addr,1);
    assert.equal(p.sizeUsd,usd("3000"));
    assert.equal(p.margin,usd("600"));
    assert.equal(await engine.positionFundingEntryRay(addr,1),DELTA);
    assert.equal(await vault.fundingPoolBalance(token),usd("15"));
    assert.equal(
      (await vault.availableBalance(addr,token))-availableBefore,
      usd("385"),
      "400 released margin minus 15 funding debit"
    );

    await(await engine.updateFundingIndex(1,DELTA)).wait();
    assert.equal(await engine.previewFundingPayment(addr,1),-usd("9"));
  });

  it("blocks a funding payer from reducing until the funding debit can be settled, with atomic rollback",async function(){
    const addr=await longTrader.getAddress();
    const token=await collateral.getAddress();

    // Remove all available collateral, leaving only the 1,000 locked margin.
    await(await vault.connect(longTrader).withdraw(token,usd("4000"))).wait();
    assert.equal(await vault.availableBalance(addr,token),0n);

    await(await engine.updateFundingIndex(1,DELTA)).wait();
    const before=Array.from(await engine.positions(addr,1));
    const checkpointBefore=await engine.positionFundingEntryRay(addr,1);

    await assert.rejects(engine.connect(longTrader).reducePosition(1,usd("2000")));

    assert.deepEqual(Array.from(await engine.positions(addr,1)),before);
    assert.equal(await engine.positionFundingEntryRay(addr,1),checkpointBefore);
    assert.equal(await vault.fundingPoolBalance(token),0n);
  });

  it("keeps funding inside the Futures domain and preserves locked margin during ordinary funding settlement",async function(){
    const addr=await longTrader.getAddress();
    const token=await collateral.getAddress();
    const lockedBefore=await vault.lockedBalance(addr,token);

    await(await engine.updateFundingIndex(1,DELTA)).wait();
    await(await engine.connect(longTrader).settleFunding(1)).wait();

    assert.equal(await vault.lockedBalance(addr,token),lockedBefore);
    const engineSource=fs.readFileSync(new URL("../contracts/futures/LQCPerpEngine.sol",import.meta.url),"utf8");
    const vaultSource=fs.readFileSync(new URL("../contracts/futures/LQCFuturesVault.sol",import.meta.url),"utf8");
    assert.ok(!engineSource.includes("LQCLendingCore"));
    assert.ok(!vaultSource.includes("LQCLendingCore"));
    assert.ok(!engineSource.includes("LQCStaking"));
    assert.ok(!vaultSource.includes("LQCStaking"));
  });
  it("FUT-06 preserves subunit funding across repeated checkpoints",async function(){
    const longAddr=await longTrader.getAddress(),shortAddr=await shortTrader.getAddress(),token=await collateral.getAddress();
    const beforeLong=await vault.availableBalance(longAddr,token),beforeShort=await vault.availableBalance(shortAddr,token);
    // 5000e18 * 100000 / 1e27 = half of one raw settlement unit.
    for(let i=0;i<2;i++){
      await(await engine.updateFundingIndex(1,100000n)).wait();
      await(await engine.connect(longTrader).settleFunding(1)).wait();
      await(await engine.connect(shortTrader).settleFunding(1)).wait();
    }
    assert.equal(beforeLong-await vault.availableBalance(longAddr,token),1n);
    assert.equal((await vault.availableBalance(shortAddr,token))-beforeShort,1n);
    assert.equal(await vault.fundingPoolBalance(token),0n);
  });
  it("FUT-06 matches exact signed accrual, preview, and duplicate-settlement invariants",async function(){
    const a=await longTrader.getAddress(),b=await shortTrader.getAddress(),token=await collateral.getAddress();
    const initial=await vault.availableBalance(a,token),opposite=await vault.availableBalance(b,token),accounted=await vault.totalAccounted(token);
    let numerator=0n;
    for(const delta of [100001n,100001n,-150001n,250001n,-400002n,100000n,900007n,-700003n]){
      numerator-=usd("5000")*delta;
      await(await engine.updateFundingIndex(1,delta)).wait();
      const preview=await engine.previewFundingPayment(a,1);
      const before=await vault.availableBalance(a,token);
      for(const signer of preview>0n?[shortTrader,longTrader]:[longTrader,shortTrader])await(await engine.connect(signer).settleFunding(1)).wait();
      assert.equal((await vault.availableBalance(a,token))-before,preview);
      const ledger=await engine.fundingLedgers(a,1);
      assert.equal(ledger.recognizedNetUnits,numerator/RAY);
      assert.equal(ledger.activeRemainderRay,numerator%RAY);
      assert.equal(numerator,((await vault.availableBalance(a,token))-initial)*RAY+ledger.activeRemainderRay);
      assert.equal((await vault.availableBalance(b,token))-opposite,-((await vault.availableBalance(a,token))-initial));
      assert.equal(await vault.totalAccounted(token),accounted);
      assert.equal(await vault.fundingPoolBalance(token),0n);
      assert.equal(await vault.isFullyBacked(token),true);
      const beforeDuplicate=await vault.availableBalance(a,token);
      await(await engine.connect(longTrader).settleFunding(1)).wait();
      assert.equal(await vault.availableBalance(a,token),beforeDuplicate);
      assert.deepEqual(Array.from(await engine.fundingLedgers(a,1)),Array.from(ledger));
    }
  });

  it("FUT-06 makes net settlement frequency independent even across a sign reversal",async function(){
    await open(third,true);
    const token=await collateral.getAddress(),a=await longTrader.getAddress(),b=await third.getAddress();
    const first=await vault.availableBalance(a,token),second=await vault.availableBalance(b,token);
    for(const delta of [300000n,-200000n]){
      await(await engine.updateFundingIndex(1,delta)).wait();
      const payment=await engine.previewFundingPayment(a,1);
      for(const signer of payment>0n?[shortTrader,longTrader]:[longTrader,shortTrader])await(await engine.connect(signer).settleFunding(1)).wait();
    }
    await(await engine.connect(third).settleFunding(1)).wait();
    assert.equal(first-await vault.availableBalance(a,token),second-await vault.availableBalance(b,token));
    assert.equal((await engine.fundingLedgers(a,1)).activeRemainderRay,-RAY/2n);
    assert.equal((await engine.fundingLedgers(b,1)).activeRemainderRay,-RAY/2n);
  });

  it("FUT-06 isolates accounts and markets and settles original size before partial reduction",async function(){
    const a=await longTrader.getAddress();
    await(await registry.addMarket(ethers.encodeBytes32String("BTC2/USDT"),await indexToken.getAddress(),await collateral.getAddress(),await oracle.getAddress(),100000,500)).wait();
    await(await engine.configureFunding(2,MAX_DELTA)).wait();
    await(await engine.connect(longTrader).openPosition(2,usd("1000"),usd("5000"),true)).wait();
    await(await engine.updateFundingIndex(1,100000n)).wait();
    await(await engine.connect(longTrader).reducePosition(1,usd("2000"))).wait();
    assert.equal((await engine.fundingLedgers(a,1)).activeRemainderRay,-RAY/2n);
    assert.equal((await engine.fundingLedgers(a,2)).activeRemainderRay,0n);
    assert.equal((await engine.fundingLedgers(await shortTrader.getAddress(),1)).activeRemainderRay,0n);
    await(await engine.updateFundingIndex(1,200000n)).wait();
    assert.equal(await engine.previewFundingPayment(a,1),-1n);
    await(await engine.connect(longTrader).settleFunding(1)).wait();
    assert.equal((await engine.fundingLedgers(a,1)).activeRemainderRay,-RAY/10n);
  });

  it("FUT-06 archives both signs without payment, netting, forgiveness, or reopening carry",async function(){
    const a=await longTrader.getAddress(),token=await collateral.getAddress();
    await(await engine.updateFundingIndex(1,100000n)).wait();
    const receipt=await(await engine.connect(longTrader).closePosition(1)).wait();
    const event=receipt.logs.map(l=>{try{return engine.interface.parseLog(l);}catch{return null;}}).find(e=>e?.name==="ClosedFundingRecorded");
    assert.equal(event.args.account,a);assert.equal(event.args.marketId,1n);assert.equal(event.args.collateralToken,token);
    let ledger=await engine.fundingLedgers(a,1);
    assert.equal(ledger.closedDebtRay,RAY/2n);assert.equal(ledger.activeRemainderRay,0n);
    await(await engine.connect(longTrader).openPosition(1,usd("1000"),usd("5000"),false)).wait();
    assert.equal(await engine.previewFundingPayment(a,1),0n);
    await(await engine.updateFundingIndex(1,100000n)).wait();
    await(await engine.connect(longTrader).closePosition(1)).wait();
    ledger=await engine.fundingLedgers(a,1);
    assert.equal(ledger.closedCreditRay,RAY/2n);assert.equal(ledger.closedDebtRay,RAY/2n);
    assert.equal(ledger.activeRemainderRay,0n);assert.equal(ledger.recognizedNetUnits,0n);
    const balance=await vault.availableBalance(a,token);
    await assert.rejects(engine.connect(longTrader).finalizeClosedFunding(1),/ClosedFundingSettlementBlocked/);
    await assert.rejects(engine.finalizeClosedFunding(1),/ClosedFundingSettlementBlocked/);
    assert.equal(await vault.availableBalance(a,token),balance);
    await(await engine.connect(longTrader).openPosition(1,usd("1000"),usd("5000"),true)).wait();
    assert.equal(await engine.previewFundingPayment(a,1),0n);
    assert.deepEqual(Array.from(await engine.fundingLedgers(a,1)),Array.from(ledger));
    assert.equal(await vault.fundingPoolBalance(token),0n);
  });

  for(const [partial,credit] of [[false,false],[true,false],[false,true]])it(`FUT-06 preserves ${credit?"credit":"debt"} on ${partial?"partial":"full"} liquidation`,async function(){
    const signer=credit?shortTrader:longTrader,a=await signer.getAddress();
    if(partial)await(await engine.configurePartialLiquidation(1,2500,0)).wait();
    await(await engine.updateFundingIndex(1,100000n)).wait();
    await setPrice(credit?"57500":"42500");
    await(await engine.connect(third).liquidate(a,1)).wait();
    const ledger=await engine.fundingLedgers(a,1);
    assert.equal((await engine.positions(a,1)).open,partial);
    if(partial)assert.equal(ledger.activeRemainderRay,-RAY/2n);
    else{
      assert.equal(ledger.activeRemainderRay,0n);
      assert.equal(credit?ledger.closedCreditRay:ledger.closedDebtRay,RAY/2n);
    }
  });

  it("FUT-06 distinguishes actual liquidation funding from unpaid Vault bad debt",async function(){
    const a=await longTrader.getAddress(),token=await collateral.getAddress();
    await(await vault.connect(longTrader).withdraw(token,usd("4000"))).wait();
    await(await engine.configureFunding(1,RAY)).wait();
    await(await engine.updateFundingIndex(1,4n*10n**26n+100000n)).wait();
    const receipt=await(await engine.connect(third).liquidate(a,1)).wait();
    const events=receipt.logs.map(l=>{try{return engine.interface.parseLog(l);}catch{return null;}});
    const checkpoint=events.find(e=>e?.name==="FundingCheckpointRecorded");
    assert.equal(checkpoint.args.recognizedDelta,-usd("2000"));
    assert.equal(checkpoint.args.fundedPayment,-usd("1000"));
    assert.equal(checkpoint.args.unpaid,usd("1000"));
    assert.equal(events.find(e=>e?.name==="FundingSettled").args.payment,-usd("2000"));
    assert.equal(await vault.fundingPoolBalance(token),usd("1000"));
    assert.equal(await vault.residualBadDebt(token),usd("1000"));
    assert.equal((await engine.fundingLedgers(a,1)).closedDebtRay,RAY/2n);
    assert.equal(await vault.isFullyBacked(token),true);
  });

  it("FUT-06 rolls back ledger, archive, funding and position after downstream fee failure",async function(){
    const a=await longTrader.getAddress(),token=await collateral.getAddress();
    await(await engine.configureTradingFee(1,10000,5000)).wait();
    await(await engine.updateFundingIndex(1,300001n)).wait();
    const position=Array.from(await engine.positions(a,1)),balance=await vault.availableBalance(a,token),accounted=await vault.totalAccounted(token);
    await assert.rejects(async()=>{await(await engine.connect(longTrader).closePosition(1,{gasLimit:3000000n})).wait();});
    assert.deepEqual(Array.from(await engine.positions(a,1)),position);
    assert.deepEqual(Array.from(await engine.fundingLedgers(a,1)),[0n,0n,0n,0n]);
    assert.equal(await engine.positionFundingEntryRay(a,1),0n);
    assert.equal(await vault.availableBalance(a,token),balance);
    assert.equal(await vault.totalAccounted(token),accounted);
    assert.equal(await vault.fundingPoolBalance(token),0n);
    assert.equal(await vault.insuranceFeeReserve(token),0n);
  });

  it("FUT-06 preserves the previous fraction when receiver settlement is unfunded",async function(){
    const a=await shortTrader.getAddress();
    await(await engine.updateFundingIndex(1,100000n)).wait();
    await(await engine.connect(shortTrader).settleFunding(1)).wait();
    await(await engine.updateFundingIndex(1,100000n)).wait();
    await assert.rejects(engine.connect(shortTrader).settleFunding(1));
    assert.equal(await engine.positionFundingEntryRay(a,1),100000n);
    assert.equal((await engine.fundingLedgers(a,1)).activeRemainderRay,RAY/2n);
  });

  it("FUT-06 handles large unsigned products and rejects signed and multiplication overflow",async function(){
    const address=await engine.getAddress(),a=await longTrader.getAddress(),size=usd("5000");
    const encode=ethers.AbiCoder.defaultAbiCoder();
    const indexSlot=ethers.keccak256(encode.encode(["uint256","uint256"],[1,1]));
    const set=async(slot,value)=>provider.send("anvil_setStorageAt",[address,slot,ethers.toBeHex(value,32)]);
    const large=(1n<<255n)/size+1n;
    await set(indexSlot,large);
    assert.equal(await engine.previewFundingPayment(a,1),-(size*large/RAY));
    for(const value of [1n<<255n,(1n<<255n)-1n]){await set(indexSlot,value);await assert.rejects(engine.previewFundingPayment(a,1),/FundingOverflow/);}
    const entryBase=ethers.keccak256(encode.encode(["address","uint256"],[a,2]));
    const entrySlot=ethers.keccak256(encode.encode(["uint256","bytes32"],[1,entryBase]));
    await set(entrySlot,(1n<<256n)-1n);
    await assert.rejects(engine.previewFundingPayment(a,1),/FundingOverflow/);
    await assert.rejects(engine.updateFundingIndex(1,1n));
    assert.deepEqual(Array.from(await engine.fundingLedgers(a,1)),[0n,0n,0n,0n]);
  });

  it("FUT-06 blocks closure atomically when the archive cannot preserve the claim",async function(){
    const a=await shortTrader.getAddress(),encode=ethers.AbiCoder.defaultAbiCoder();
    // fundingLedgers is appended at slot 14; verify the injected fixture via its getter.
    const outer=ethers.keccak256(encode.encode(["address","uint256"],[a,14]));
    const slot=BigInt(ethers.keccak256(encode.encode(["uint256","bytes32"],[1,outer])));
    await provider.send("anvil_setStorageAt",[await engine.getAddress(),ethers.toBeHex(slot+2n,32),ethers.toBeHex((1n<<256n)-1n,32)]);
    assert.equal((await engine.fundingLedgers(a,1)).closedCreditRay,(1n<<256n)-1n);
    await(await engine.updateFundingIndex(1,100000n)).wait();
    await assert.rejects(engine.connect(shortTrader).closePosition(1),
      error=>error.data===engine.interface.getError("FundingClosureBlocked").selector);
    assert.equal((await engine.positions(a,1)).open,true);
    assert.equal((await engine.fundingLedgers(a,1)).activeRemainderRay,0n);
    assert.equal(await engine.positionFundingEntryRay(a,1),0n);
  });

  it("FUT-06 rejects recognized-net overflow without advancing the checkpoint",async function(){
    const a=await shortTrader.getAddress(),encode=ethers.AbiCoder.defaultAbiCoder();
    const outer=ethers.keccak256(encode.encode(["address","uint256"],[a,14]));
    const slot=ethers.keccak256(encode.encode(["uint256","bytes32"],[1,outer]));
    await(await engine.updateFundingIndex(1,200000n)).wait();
    for(const value of [(1n<<255n)-1n,1n<<255n]){
      await provider.send("anvil_setStorageAt",[await engine.getAddress(),slot,ethers.toBeHex(value,32)]);
      const before=Array.from(await engine.fundingLedgers(a,1));
      await assert.rejects(engine.previewFundingPayment(a,1),/FundingOverflow/);
      assert.deepEqual(Array.from(await engine.fundingLedgers(a,1)),before);
      assert.equal(await engine.positionFundingEntryRay(a,1),0n);
    }
  });
});
