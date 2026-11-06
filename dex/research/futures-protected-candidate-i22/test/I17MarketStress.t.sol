// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {ConditionalAdlFixture,Engine,Vault,Registry,TestCollateral,FundingLedger} from "./ConditionalAdl.t.sol";
contract I17MarketStressTest is ConditionalAdlFixture {
 uint256[15] ids;event log_named_uint(string name,uint256 value);
 function many()internal{
  _deposit(t,A,20000e18);
  for(uint256 i;i<15;i++){uint256 id=reg.addMarket(bytes32(i+100),address(42),address(t),oracle,100000,500);ids[i]=id;_activate(id);_open(A,id,true,1000e18,1000e18);engine.configureFunding(id,RAY);}
  _debtForAdl(false);engine.configureFunding(1,RAY);
  vm.prank(A);engine.reserveOtherCollateral(address(t),bytes32("stress"),100e18);
  _withdraw(A,t,vault.availableBalance(A,address(t))-100e18);
  enableConditional();require(engine.fundingMarketLength(A,address(t))==16&&engine.fundingActiveCount(A,address(t))==16);assertConditional();
 }
 function others()internal view returns(bytes32 h){for(uint256 i;i<15;i++){h=keccak256(abi.encode(h,_position(A,ids[i]),engine.fundingNonce(key(A,ids[i])),engine.fundingRemainderRay(A,ids[i],address(t)),ledger.payableAmount(key(A,ids[i])),ledger.receivable(key(A,ids[i]))));}}
 function fractions()internal{for(uint256 i;i<15;i++)engine.updateFundingIndex(ids[i],100000);}
 function check()internal view{assertConditional();_assertBooks(t);_assertBooks(u);require(vault.otherReservedCollateral(A,address(t))==100e18);require(vault.insuranceFeeReserve(address(t))==0&&vault.treasuryFeeReserve(address(t))==0&&vault.totalInsuranceCovered(address(t))==0);}
 function testI17SixteenMarketSafeReleasedCollateral()public{many();fractions();engine.updateFundingIndex(1,-DELTA-100000);bytes32 o=others();engine.executeAdl(A,1,1250e18);require(others()==o&&due()==0&&vault.fundingPoolBalance(address(t))==15e18);require(vault.lockedBalance(A,address(t))==15750e18&&vault.availableBalance(A,address(t))==335e18);require(vault.withdrawableBalance(A,address(t))==235e18-16);check();}
 function testI17SixteenMarketWithdrawalReservesAllFractions()public{many();fractions();engine.updateFundingIndex(1,-DELTA-100000);engine.executeAdl(A,1,1250e18);bytes32 h=snap();vm.prank(A);vm.expectRevert(Vault.InsufficientUnencumberedCollateral.selector);vault.withdraw(address(t),235e18-15);require(snap()==h);_withdraw(A,t,235e18-16);require(vault.availableBalance(A,address(t))==100e18+16);check();}
 function testI17SixteenMarketOtherPendingIntegerRejects()public{many();engine.updateFundingIndex(ids[14],1e25);engine.updateFundingIndex(1,-DELTA);reject(Engine.LedgerDebtOutstanding.selector);require(engine.previewFundingPayment(A,ids[14])==-10e18&&due()==0);check();}
 function testI17SixteenMarketOtherConfirmedIntegerRejects()public{many();engine.updateFundingIndex(ids[14],2e26);_settle(A,ids[14]);require(ledger.payableAmount(key(A,ids[14]))==200e18);engine.updateFundingIndex(1,-DELTA);reject(Engine.LedgerDebtOutstanding.selector);check();}
 function testI17SixteenMarketInsufficientReleaseRejects()public{many();fractions();engine.updateFundingIndex(1,-1e26);reject(Engine.LedgerDebtOutstanding.selector);require(engine.previewFundingPayment(A,1)==-500e18&&vault.fundingPoolBalance(address(t))==0);check();}
 function testI17SixteenMarketPoolShortagePreservesClaims()public{many();fractions();engine.updateFundingIndex(1,DELTA+100000);bytes32 o=others();engine.executeAdl(A,1,1250e18);require(others()==o&&ledger.receivable(key(A,1))==15e18&&engine.fundingRemainderRay(A,1,address(t))==5e26&&vault.fundingPoolBalance(address(t))==0);require(vault.availableBalance(A,address(t))==350e18);check();}
 function testI17SixteenMarketLateFailureAtomic()public{many();fractions();engine.updateFundingIndex(1,-DELTA-100000);bytes32 h=snap();mockFail(address(vault),Vault.absorbAdlBadDebt.selector);vm.expectRevert();engine.executeAdl(A,1,1250e18);vl.clearMockedCalls();require(snap()==h&&due()==0&&engine.fundingNonce(key(A,1))==0);check();}
 function testI17SixteenMarketLedgerFailureAtomic()public{many();engine.updateFundingIndex(1,-DELTA);bytes32 h=snap();mockFail(address(ledger),FundingLedger.collect.selector);vm.expectRevert();engine.executeAdl(A,1,1250e18);vl.clearMockedCalls();require(snap()==h);check();}
 function testI17SixteenMarketOracleFailureAtomic()public{many();engine.updateFundingIndex(1,-DELTA);r.setBroken(true);bytes32 h=snap();vm.expectRevert();engine.executeAdl(A,1,1250e18);require(snap()==h);check();}
 function testI17SixteenMarketAdlWithdrawLiquidate()public{
  many();engine.updateFundingIndex(1,-DELTA);bytes32 o=others();engine.executeAdl(A,1,1250e18);require(vault.residualBadDebt(address(t))==125e18);
  engine.updateFundingIndex(1,-DELTA);engine.executeAdl(A,1,100e18);require(vault.residualBadDebt(address(t))==95e18&&due()==0);
  uint256 cash=vault.fundingPoolBalance(address(t));require(cash==2625e16);require(others()==o);
  _withdraw(A,t,1e18);_price(65000e18);arm(1);engine.liquidate(A,1);
  (uint256 margin,uint256 size,,,bool open)=engine.positions(A,1);require(!open&&margin==0&&size==0);require(others()==o&&engine.fundingActiveCount(A,address(t))==15&&vault.lockedBalance(A,address(t))==15000e18);
  require(vault.fundingPoolBalance(address(t))==cash&&ledger.accountPayable(A,address(t))==0&&vault.residualBadDebt(address(t))>=95e18);check();
 }
 function testI17SixteenMarketPartialLiquidationAdlFullLiquidation()public{
  _deposit(t,A,20000e18);for(uint256 i;i<15;i++){uint256 id=reg.addMarket(bytes32(i+200),address(42),address(t),oracle,100000,500);ids[i]=id;_activate(id);_open(A,id,true,1000e18,1000e18);engine.configureFunding(id,RAY);}
  vm.prank(A);engine.reserveOtherCollateral(address(t),bytes32("stress"),100e18);
  engine.configureFunding(1,RAY);_open(A,1,true,1000e18,5000e18);_open(B,1,false,1000e18,5000e18);_withdraw(A,t,vault.availableBalance(A,address(t))-100e18);
  engine.updateFundingIndex(1,12e25);_price(47500e18);engine.configurePartialLiquidation(1,5000,0);arm(1);engine.liquidate(A,1);
  _price(65000e18);_close(B,1);enableConditional();bytes32 o=others();engine.executeAdl(A,1,625e18);_price(35000e18);engine.configurePartialLiquidation(1,10000,0);engine.liquidate(A,1);
  require(others()==o&&vault.lockedBalance(A,address(t))==15000e18&&ledger.receivable(key(B,1))==600e18&&vault.fundingPoolBalance(address(t))==600e18);check();
 }
 function capacityOnly()internal{_deposit(t,A,20000e18);for(uint256 i;i<15;i++){uint256 id=reg.addMarket(bytes32(i+300),address(42),address(t),oracle,100000,500);ids[i]=id;_activate(id);_open(A,id,true,1000e18,1000e18);}_open(A,1,false,1000e18,5000e18);vm.prank(A);engine.reserveOtherCollateral(address(t),bytes32("stress"),100e18);_withdraw(A,t,vault.availableBalance(A,address(t))-100e18);enableConditional();require(engine.fundingMarketLength(A,address(t))==16&&vault.residualBadDebt(address(t))==0);}
 function testI17SeventeenthSharedMarketRefusedAtomically()public{uint256 id=reg.addMarket(bytes32("17th"),address(42),address(t),oracle,100000,500);_activate(id);capacityOnly();_deposit(t,A,1000e18);bytes32 h=snap();vm.prank(A);vm.expectRevert(Engine.FundingInventoryInvalid.selector);engine.openPosition(id,1000e18,1000e18,true);require(snap()==h&&engine.fundingMarketLength(A,address(t))==16);check();}
 function testI17SixteenMarketTwentyHalfUnitDebtsAndRealCollection()public{many();for(uint256 round;round<20;round++)for(uint256 i;i<15;i++){engine.updateFundingIndex(ids[i],500000);_settle(A,ids[i]);}require(vault.fundingPoolBalance(address(t))==0&&ledger.accountPayable(A,address(t))==150);for(uint256 i;i<15;i++){require(ledger.payableAmount(key(A,ids[i]))==10&&engine.fundingRemainderRay(A,ids[i],address(t))==0);}reject(Engine.LedgerDebtOutstanding.selector);_deposit(t,A,150);for(uint256 i;i<15;i++){vm.prank(A);engine.repayFundingDebt(ids[i],10);}require(ledger.accountPayable(A,address(t))==0&&vault.fundingPoolBalance(address(t))==150&&vault.availableBalance(A,address(t))==100e18);check();}
}

