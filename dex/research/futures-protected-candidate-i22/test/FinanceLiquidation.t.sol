// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {FinanceFixture,Engine,Vault} from "./FinanceFixture.sol";
contract FinanceLiquidationTest is FinanceFixture {

    function testFinancePartialLiquidationRetainsRemainingMargin() public {
        engine.configurePartialLiquidation(1,2500,0);_open(A,1,true,1000e18,5000e18);_price(42500e18);
        vm.prank(L);engine.liquidate(A,1);
        (uint256 margin,uint256 size,uint256 entry,,bool open_)=engine.positions(A,1);
        require(open_&&size==3750e18&&margin==8125e17&&entry==50000e18);
        require(vault.availableBalance(A,address(t))==4000e18);
        bytes32 before_=_snapshot();vm.prank(L);vm.expectRevert(Engine.NotLiquidatable.selector);engine.liquidate(A,1);
        require(_snapshot()==before_);_assertBooks(t);
    }
    function testFinancePartialPromotesToFullBelowMinimumRemainder() public {
        engine.configurePartialLiquidation(1,2500,4000e18);_open(A,1,true,1000e18,5000e18);_price(42500e18);
        vm.prank(L);engine.liquidate(A,1);
        (,,,,bool open_)=engine.positions(A,1);require(!open_&&vault.availableBalance(A,address(t))==4250e18);_assertBooks(t);
    }
    function testFinanceDefaultFullLiquidation() public {
        _open(A,1,true,1000e18,5000e18);_price(42500e18);vm.prank(L);engine.liquidate(A,1);
        require(engine.openInterestUsd(1)==0&&vault.lockedBalance(A,address(t))==0);_assertBooks(t);
    }
    function testFinanceLiquidationCrystallizesFundingDebit() public {
        engine.configurePartialLiquidation(1,2500,0);engine.configureFunding(1,RAY/10);
        _open(A,1,true,1000e18,5000e18);engine.updateFundingIndex(1,6e25);_price(45000e18);
        vm.prank(L);engine.liquidate(A,1);
        (uint256 margin,uint256 size,,,)=engine.positions(A,1);
        require(margin==575e18&&size==3750e18&&vault.fundingPoolBalance(address(t))==300e18);
        require(engine.positionFundingEntryRay(A,1)==6e25);_assertBooks(t);
    }
    function testFinanceLiquidationCreditsFundedPositiveFunding() public {
        engine.configurePartialLiquidation(1,2500,0);engine.configureFunding(1,RAY/10);
        _open(A,1,true,1000e18,5000e18);_open(B,1,false,1000e18,5000e18);
        engine.updateFundingIndex(1,-6e25);_settle(B,1);_price(39000e18);
        vm.prank(L);engine.liquidate(A,1);
        (uint256 margin,uint256 size,,,)=engine.positions(A,1);
        require(margin==1025e18&&size==3750e18&&vault.fundingPoolBalance(address(t))==0);_assertBooks(t);
    }
    function testFinanceFullLiquidationUsesInsurance() public {
        _insuredLong(10000,10000);_price(35000e18);vm.prank(L);engine.liquidate(A,1);
        require(vault.totalInsuranceCovered(address(t))==500e18&&vault.residualBadDebt(address(t))==0);
        require(vault.isSolvent(address(t)));_assertBooks(t);
    }
    function testFinanceUnpaidLiquidationFundingInsuranceAndResidual() public {
        engine.configureFunding(1,RAY);_insuredLong(10000,5000);_withdraw(A,t,3500e18);
        engine.updateFundingIndex(1,4e26);vm.prank(L);engine.liquidate(A,1);
        require(vault.fundingPoolBalance(address(t))==1500e18);
        require(vault.totalInsuranceCovered(address(t))==500e18&&vault.residualBadDebt(address(t))==500e18);
        require(!vault.isSolvent(address(t)));_assertBooks(t);
    }

}

