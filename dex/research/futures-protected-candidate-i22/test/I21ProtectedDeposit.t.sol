// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {ProtectedFixture,Registry} from './ProtectedFixture.sol';
import {ConditionalAdlFixture} from './ConditionalAdl.t.sol';
import {FundingLedger} from '../src/funding/FundingLedger.sol';
contract I21ProtectedDepositTest is ProtectedFixture {
 function testDepositThenFundingPayableCashConservation()public{
  _deposit(t,A,100e18);engine.configureFunding(1,RAY);_open(A,1,true,1000e18,5000e18);engine.updateFundingIndex(1,DELTA);_settle(A,1);
  require(vault.availableBalance(A,address(t))==4085e18&&vault.fundingPoolBalance(address(t))==15e18);_assertBooks(t);require(reg.liquidationReady(1));
 }
 function testDepositThenPartialLiquidationConservesBacking()public{
  _deposit(t,A,100e18);engine.configureFunding(1,RAY);_open(A,1,true,1000e18,5000e18);_withdraw(A,t,4100e18);engine.updateFundingIndex(1,12e25);_price(47500e18);engine.configurePartialLiquidation(1,5000,0);reg.setMarketMode(1,Registry.MarketMode.REDUCE_ONLY);engine.liquidate(A,1);
  (uint256 m,uint256 s,,,bool open)=engine.positions(A,1);require(open&&s==2500e18&&m==275e18&&vault.fundingPoolBalance(address(t))==600e18);_assertBooks(t);
 }
 function testDepositThenFullLiquidationPreservesUnpaidFunding()public{
  _deposit(t,A,100e18);engine.configureFunding(1,RAY);_open(A,1,true,1000e18,5000e18);_withdraw(A,t,4100e18);engine.updateFundingIndex(1,2e26);_price(42500e18);engine.liquidate(A,1);
  FundingLedger l=engine.fundingLedger();require(l.accountPayable(A,address(t))==750e18&&vault.fundingPoolBalance(address(t))==250e18&&vault.residualBadDebt(address(t))==0);_assertBooks(t);
 }
 function testNewDepositPreservesExistingReservation()public{
  vm.prank(address(engine));vault.reserveCollateral(A,address(t),bytes32('external'),100e18);uint256 beforeFree=vault.withdrawableBalance(A,address(t));_deposit(t,A,100e18);require(vault.otherReservedCollateral(A,address(t))==100e18&&vault.withdrawableBalance(A,address(t))==beforeFree+100e18);_assertBooks(t);
 }
}
contract I21DepositConditionalAdlTest is ConditionalAdlFixture {
 function testDepositThenConditionalAdlRealRecovery()public{
  _deposit(t,A,100e18);prepare(-DELTA,0);engine.executeAdl(A,1,1250e18);position(750e18,3750e18);require(due()==0&&vault.fundingPoolBalance(address(t))==15e18);_assertBooks(t);
 }
}
