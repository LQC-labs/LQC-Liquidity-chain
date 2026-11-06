// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {FinanceFixture,Engine,Vault,Registry} from "./FinanceFixture.sol";
contract FinanceAtomicityTest is FinanceFixture {

    function testFinanceOracleFailedEntryWholeSnapshot() public {
        engine.configureTradingFee(1,10,2500);r.setBroken(true);bytes32 before_=_snapshot();
        vm.prank(A);vm.expectRevert(Engine.MarketInactive.selector);engine.openPosition(1,1000e18,5000e18,true);
        require(_snapshot()==before_);_assertBooks(t);
    }
    function testFinanceOracleFailureRollsBackCloseIncludingFundingAndFees() public {
        engine.configureFunding(1,1e25);engine.configureTradingFee(1,10,2500);_open(A,1,true,1000e18,5000e18);
        engine.updateFundingIndex(1,DELTA);r.setBroken(true);bytes32 before_=_snapshot();
        vm.prank(A);vm.expectRevert();engine.closePosition(1);require(_snapshot()==before_);_assertBooks(t);
    }
    function testFinanceOracleFailureRollsBackPartialReduction() public {
        engine.configureFunding(1,1e25);engine.configureTradingFee(1,10,2500);_open(A,1,true,1000e18,5000e18);
        engine.updateFundingIndex(1,DELTA);r.setBroken(true);bytes32 before_=_snapshot();
        vm.prank(A);vm.expectRevert();engine.reducePosition(1,2000e18);require(_snapshot()==before_);_assertBooks(t);
    }
    function testFinanceOracleFailureRollsBackLiquidationFundingCrystallization() public {
        engine.configureFunding(1,RAY/10);engine.configurePartialLiquidation(1,2500,0);
        _open(A,1,true,1000e18,5000e18);engine.updateFundingIndex(1,6e25);_price(45000e18);r.setBroken(true);
        bytes32 before_=_snapshot();vm.prank(L);vm.expectRevert();engine.liquidate(A,1);
        require(_snapshot()==before_);_assertBooks(t);
    }
    function testFinanceOracleFailureRollsBackAdl() public {
        _debtForAdl(false);engine.configureAdlSafety(1,true,2500);r.setBroken(true);
        bytes32 before_=_snapshot();vm.expectRevert();engine.executeAdl(A,1,1250e18);
        require(_snapshot()==before_);_assertBooks(t);
    }
    function testFinanceOracleFailureRollsBackFundingIndex() public {
        _longAndShortFunding();r.setBroken(true);bytes32 before_=_snapshot();
        vm.expectRevert();engine.updateFundingIndex(1,DELTA);require(_snapshot()==before_);_assertBooks(t);
    }

}

