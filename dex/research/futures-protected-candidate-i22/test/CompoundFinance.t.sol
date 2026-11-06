// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {FinanceFixture,Engine,Vault,Registry} from './FinanceFixture.sol';
contract CompoundFinanceTest is FinanceFixture {
    event RoundingObservation(uint256 checkpoints,uint256 aggregateDebit,uint256 collected,uint256 dust);
    function prep(int256 delta) internal {_debtForAdl(false);engine.configureFunding(1,RAY);engine.updateFundingIndex(1,delta);engine.configureAdlSafety(1,true,10000);}
    function testIPartialLiquidationAdlFullLiquidation() public {
        _open(A,1,false,1000e18,5000e18);_open(B,1,true,1000e18,5000e18);engine.configurePartialLiquidation(1,2500,0);
        _price(57500e18);vm.prank(L);engine.liquidate(A,1);(uint256 m,uint256 s,,,)=engine.positions(A,1);require(m==8125e17&&s==3750e18);_assertBooks(t);
        _price(35000e18);_close(B,1);require(vault.residualBadDebt(address(t))==500e18);engine.configureFunding(1,1e25);engine.updateFundingIndex(1,-DELTA);
        engine.configureAdlSafety(1,true,10000);engine.executeAdl(A,1,1000e18);require(vault.fundingPoolBalance(address(t))==1125e16&&vault.residualBadDebt(address(t))==200e18);_assertBooks(t);
        _price(60000e18);engine.configurePartialLiquidation(1,10000,0);vm.prank(L);engine.liquidate(A,1);(,,,,bool open)=engine.positions(A,1);require(!open&&engine.openInterestUsd(1)==0);_assertBooks(t);
    }
    function testISettlePartialAdlResettle() public {
        prep(-DELTA);_settle(A,1);require(vault.fundingPoolBalance(address(t))==15e18);engine.executeAdl(A,1,1250e18);require(vault.fundingPoolBalance(address(t))==15e18);
        engine.updateFundingIndex(1,-DELTA);require(engine.previewFundingPayment(A,1)==-1125e16);_settle(A,1);require(vault.fundingPoolBalance(address(t))==2625e16&&engine.previewFundingPayment(A,1)==0);_assertBooks(t);
    }
    function testIFundingShortageDebtAndEffectiveRiskRemain() public {
        prep(DELTA);bytes32 snap=_snapshot();vm.expectRevert(Vault.InsufficientFundingPool.selector);engine.executeAdl(A,1,1250e18);require(_snapshot()==snap);require(vault.residualBadDebt(address(t))==500e18);
        (,,,,,,bool active)=reg.markets(1);require(!active);reg.setMarketMode(1,Registry.MarketMode.REDUCE_ONLY);vm.expectRevert(Registry.ResidualDebt.selector);reg.setRecoveryApproved(1,true);_assertBooks(t);
    }
    function testIAvailableShortageCannotUseLockedOrReleasedMargin() public {
        prep(-DELTA);_withdraw(A,t,4000e18);bytes32 snap=_snapshot();vm.expectRevert(Vault.InsufficientAvailableBalance.selector);engine.executeAdl(A,1,5000e18);require(_snapshot()==snap&&vault.lockedBalance(A,address(t))==1000e18);_assertBooks(t);
    }
    function testIExhaustedInsuranceAndFundingShortageDoNotConsumeTreasury() public {
        engine.configureTradingFee(1,10,5000);engine.configureInsuranceCoverage(1,10000);_open(A,1,false,1000e18,5000e18);_open(B,1,true,1000e18,5000e18);engine.configureTradingFee(1,0,0);
        _price(35000e18);_close(B,1);require(vault.insuranceFeeReserve(address(t))==0&&vault.totalInsuranceCovered(address(t))==5e18&&vault.treasuryFeeReserve(address(t))==5e18&&vault.residualBadDebt(address(t))==495e18);
        engine.configureFunding(1,1e25);engine.updateFundingIndex(1,DELTA);engine.configureAdlSafety(1,true,2500);bytes32 snap=_snapshot();vm.expectRevert(Vault.InsufficientFundingPool.selector);engine.executeAdl(A,1,1250e18);require(_snapshot()==snap);_assertBooks(t);
    }
    function testIAdlFailureDoesNotTouchDistinctCollateralFunding() public {
        _open(A,2,true,1000e18,5000e18);engine.configureFunding(2,1e25);engine.updateFundingIndex(2,DELTA);_settle(A,2);bytes32 other=_collateralSnapshot(u);bytes32 market=_marketSnapshot(2);
        prep(DELTA);bytes32 snap=_snapshot();vm.expectRevert(Vault.InsufficientFundingPool.selector);engine.executeAdl(A,1,1250e18);require(_snapshot()==snap&&_collateralSnapshot(u)==other&&_marketSnapshot(2)==market);_assertBooks(t);_assertBooks(u);
    }
    function testIRoundingAccumulationConservesTenBaseUnits() public {
        _longAndShortFunding();uint256 n=20;for(uint256 j;j<n;j++){engine.updateFundingIndex(1,100000);_settle(A,1);}
        // Adopted policy: twenty half-base-unit accruals settle ten base units, with no carry left.
        uint256 aggregate=5000e18*(n*100000)/RAY;uint256 paid=vault.fundingPoolBalance(address(t));
        emit RoundingObservation(n,aggregate,paid,aggregate-paid);
        require(aggregate==10&&paid==10&&engine.fundingRemainderRay(A,1,address(t))==0);
        require(engine.previewFundingPayment(A,1)==0);_assertBooks(t);
    }
    function testIExactCumulativeFundingMustNotDisappearAcrossZeroCheckpoints() public {
        _longAndShortFunding();for(uint256 j;j<20;j++){engine.updateFundingIndex(1,100000);_settle(A,1);}
        // Strong conservation acceptance criterion: accrued aggregate 10 token base units must survive.
        uint256 paid=vault.fundingPoolBalance(address(t));int256 pending=engine.previewFundingPayment(A,1);
        require(int256(paid)-pending==10,'cumulative funding dust erased');
    }
    function testIExtremePositionOverflowRevertsAtomically() public {
        bytes32 snap=_snapshot();vm.prank(A);vm.expectRevert();engine.openPosition(1,1000e18,type(uint256).max,true);require(_snapshot()==snap);_assertBooks(t);
    }
    function testIExtremeFundingBoundsAndFullRateShortage() public {
        prep(-int256(RAY));require(engine.previewFundingPayment(A,1)==-5000e18);bytes32 snap=_snapshot();vm.expectRevert(Vault.InsufficientAvailableBalance.selector);engine.executeAdl(A,1,1250e18);require(_snapshot()==snap);
        vm.expectRevert(Engine.InvalidFundingDelta.selector);engine.updateFundingIndex(1,type(int256).min);vm.expectRevert(Engine.FundingDeltaTooLarge.selector);engine.updateFundingIndex(1,type(int256).max);require(_snapshot()==snap);_assertBooks(t);
    }
    function testFuzzIRepeatedAdlFundingBookConservation(uint256 seed,uint8 count) public {
        prep(-DELTA);uint256 steps=1+uint256(count)%32;
        for(uint256 j;j<steps;j++){
            uint256 beforePool=vault.fundingPoolBalance(address(t));int256 due=engine.previewFundingPayment(A,1);require(due<=0);
            uint256 beforeAvailable=vault.availableBalance(A,address(t));(uint256 margin,uint256 size,,,)=engine.positions(A,1);uint256 release=margin*1e18/size;
            engine.executeAdl(A,1,1e18);require(vault.fundingPoolBalance(address(t))==beforePool+uint256(-due));require(vault.availableBalance(A,address(t))==beforeAvailable+release-uint256(-due));require(engine.previewFundingPayment(A,1)==0);_assertBooks(t);
            seed=uint256(keccak256(abi.encode(seed,j)));engine.updateFundingIndex(1,-int256(1+seed%1e22));
        }
        _settle(A,1);require(engine.previewFundingPayment(A,1)==0);_assertBooks(t);
    }
}
