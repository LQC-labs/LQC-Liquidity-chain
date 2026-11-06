// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {FinanceFixture,Engine,Vault} from "./FinanceFixture.sol";
contract FinanceFundingTest is FinanceFixture {

    function testFinanceFundingPositivePayerReceiverConservation() public {
        _longAndShortFunding();engine.updateFundingIndex(1,DELTA);
        require(engine.previewFundingPayment(A,1)==-15e18&&engine.previewFundingPayment(B,1)==15e18);
        uint256 accounted=vault.totalAccounted(address(t));_settle(A,1);
        require(vault.availableBalance(A,address(t))==3985e18&&vault.fundingPoolBalance(address(t))==15e18);
        require(vault.totalAccounted(address(t))==accounted-15e18);_assertBooks(t);
        _settle(B,1);require(vault.availableBalance(B,address(t))==4015e18&&vault.fundingPoolBalance(address(t))==0);
        require(vault.totalAccounted(address(t))==accounted);_assertBooks(t);
    }
    function testFinanceFundingReceiverBeforePayerRollback() public {
        _longAndShortFunding();engine.updateFundingIndex(1,DELTA);bytes32 before_=_snapshot();
        vm.prank(B);vm.expectRevert(Vault.InsufficientFundingPool.selector);engine.settleFunding(1);
        require(_snapshot()==before_);
    }
    function testFinanceFundingNegativeIndexReversesPayer() public {
        _longAndShortFunding();engine.updateFundingIndex(1,-int256(DELTA));
        require(engine.previewFundingPayment(B,1)==-15e18&&engine.previewFundingPayment(A,1)==15e18);
        _settle(B,1);require(vault.fundingPoolBalance(address(t))==15e18);
        _settle(A,1);require(vault.availableBalance(A,address(t))==4015e18&&vault.availableBalance(B,address(t))==3985e18);
        require(vault.fundingPoolBalance(address(t))==0);_assertBooks(t);
    }
    function testFinanceFundingPermissionsAndBounds() public {
        _longAndShortFunding();bytes32 before_=_snapshot();
        vm.prank(A);vm.expectRevert(Engine.Forbidden.selector);engine.updateFundingIndex(1,DELTA);
        vm.expectRevert();engine.updateFundingIndex(1,1e25+1);
        vm.expectRevert();engine.updateFundingIndex(1,0);
        require(_snapshot()==before_);
    }
    function testFinanceNewPositionHasNoRetroactiveFunding() public {
        _longAndShortFunding();engine.updateFundingIndex(1,DELTA);_open(C,1,true,1000e18,5000e18);
        require(engine.positionFundingEntryRay(C,1)==int256(DELTA)&&engine.previewFundingPayment(C,1)==0);_assertBooks(t);
    }
    function testFinanceFundingSettlesBeforePartialAndUsesRemainingSize() public {
        _longAndShortFunding();engine.updateFundingIndex(1,DELTA);_reduce(A,1,2000e18);
        require(vault.availableBalance(A,address(t))==4385e18&&vault.fundingPoolBalance(address(t))==15e18);
        require(engine.positionFundingEntryRay(A,1)==int256(DELTA));
        engine.updateFundingIndex(1,DELTA);require(engine.previewFundingPayment(A,1)==-9e18);_assertBooks(t);
    }
    function testFinanceFundingInsufficientPayerReductionAtomicity() public {
        _longAndShortFunding();_withdraw(A,t,4000e18);engine.updateFundingIndex(1,DELTA);
        bytes32 before_=_snapshot();vm.prank(A);vm.expectRevert(Vault.InsufficientAvailableBalance.selector);engine.reducePosition(1,2000e18);
        require(_snapshot()==before_);_assertBooks(t);
    }
    function testFinanceFundingCannotBeSettledTwice() public {
        _longAndShortFunding();engine.updateFundingIndex(1,DELTA);_settle(A,1);
        bytes32 before_=_snapshot();_settle(A,1);require(_snapshot()==before_);_assertBooks(t);
    }

}

