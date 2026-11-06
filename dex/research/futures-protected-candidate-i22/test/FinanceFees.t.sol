// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {FinanceFixture,Engine,Vault} from "./FinanceFixture.sol";
contract FinanceFeesTest is FinanceFixture {

    function testFinanceEntryFeeReserveConservation() public {
        engine.configureTradingFee(1,10,2500);_open(A,1,true,1000e18,5000e18);
        require(vault.availableBalance(A,address(t))==3995e18);
        require(vault.insuranceFeeReserve(address(t))==125e16&&vault.treasuryFeeReserve(address(t))==375e16);_assertBooks(t);
    }
    function testFinancePartialFeeOnlyReducedNotional() public {
        engine.configureTradingFee(1,10,2500);_open(A,1,true,1000e18,5000e18);
        _reduce(A,1,2000e18);require(vault.availableBalance(A,address(t))==4393e18);
        require(vault.insuranceFeeReserve(address(t))==175e16&&vault.treasuryFeeReserve(address(t))==525e16);_assertBooks(t);
    }
    function testFinanceCloseFeeConservesReserves() public {
        engine.configureTradingFee(1,10,2500);_open(A,1,true,1000e18,5000e18);_close(A,1);
        require(vault.availableBalance(A,address(t))==4990e18);
        require(vault.insuranceFeeReserve(address(t))==25e17&&vault.treasuryFeeReserve(address(t))==75e17);_assertBooks(t);
    }
    function testFinancePositivePnlCannotConsumeReservedFees() public {
        engine.configureTradingFee(1,10,2500);_open(A,1,true,1000e18,5000e18);_price(55000e18);
        bytes32 before_=_snapshot();vm.prank(A);vm.expectRevert(Vault.InsufficientVaultLiquidity.selector);engine.reducePosition(1,2000e18);
        require(_snapshot()==before_);_assertBooks(t);
    }
    function testFinanceFeeAfterMarginLockFailureRollsBackEntry() public {
        engine.configureTradingFee(1,10,2500);_withdraw(A,t,4000e18);
        bytes32 before_=_snapshot();vm.prank(A);vm.expectRevert(Vault.InsufficientAvailableBalance.selector);engine.openPosition(1,1000e18,5000e18,true);
        require(_snapshot()==before_);_assertBooks(t);
    }

}

