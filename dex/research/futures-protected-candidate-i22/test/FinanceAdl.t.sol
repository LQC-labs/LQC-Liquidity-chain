// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {FinanceFixture,Engine,Vault,Registry} from "./FinanceFixture.sol";
contract FinanceAdlTest is FinanceFixture {

    event FundingClaimObservation(int256 beforeClaim,int256 afterClaim,int256 cashFunding,uint256 pool);
    function testFinanceAdlDisabledAndUnauthorizedRejected() public {
        _debtForAdl(false);bytes32 before_=_snapshot();
        vm.expectRevert(Engine.AdlNotEnabled.selector);engine.executeAdl(A,1,1000e18);require(_snapshot()==before_);
        engine.configureAdlSafety(1,true,2500);before_=_snapshot();
        vm.prank(B);vm.expectRevert(Engine.Forbidden.selector);engine.executeAdl(A,1,1000e18);require(_snapshot()==before_);
    }
    function testFinanceAdlCapAndExactDebtAbsorption() public {
        _debtForAdl(false);engine.configureAdlSafety(1,true,2500);bytes32 before_=_snapshot();
        vm.expectRevert(Engine.AdlReductionTooLarge.selector);engine.executeAdl(A,1,1300e18);require(_snapshot()==before_);
        engine.executeAdl(A,1,1250e18);
        (uint256 margin,uint256 size,,,)=engine.positions(A,1);
        require(size==3750e18&&margin==750e18&&vault.residualBadDebt(address(t))==125e18);
        require(vault.availableBalance(A,address(t))==4250e18);_assertBooks(t);
    }
    function testFinanceAdlCannotTargetLosingPosition() public {
        _debtForAdl(true);engine.configureAdlSafety(1,true,2500);bytes32 before_=_snapshot();
        vm.expectRevert(Engine.AdlPositionNotProfitable.selector);engine.executeAdl(A,1,1000e18);require(_snapshot()==before_);
    }
    function testFinanceAdlRequiresActualResidualDebt() public {
        _open(A,1,false,1000e18,5000e18);engine.configureAdlSafety(1,true,2500);
        bytes32 before_=_snapshot();vm.expectRevert(Engine.AdlBadDebtRequired.selector);engine.executeAdl(A,1,1000e18);require(_snapshot()==before_);
    }
    function testFinanceAdlAbsorptionNeverExceedsRemainingDebt() public {
        _debtForAdl(false);engine.configureAdlSafety(1,true,2500);
        engine.executeAdl(A,1,1250e18);require(vault.residualBadDebt(address(t))==125e18);
        uint256 accounted=vault.totalAccounted(address(t));engine.executeAdl(A,1,9375e17);
        require(vault.residualBadDebt(address(t))==0&&vault.totalAccounted(address(t))==accounted);_assertBooks(t);
    }
    // Finance invariant, not an assumption that the implementation already satisfies it:
    // accrued funding claim = cash funding settled + remaining accrued funding claim.
    // Margin release and ADL profit withholding are excluded from this funding-only equation.
    function testFinanceAdlMustPreserveAccruedReceiverFundingClaim() public {
        engine.configureFunding(1,1e25);_open(A,1,false,1000e18,5000e18);_open(B,1,true,1000e18,5000e18);
        engine.updateFundingIndex(1,DELTA);_price(35000e18);_close(B,1);
        require(vault.residualBadDebt(address(t))==500e18&&vault.fundingPoolBalance(address(t))==15e18);
        engine.configureAdlSafety(1,true,2500);int256 beforeClaim=engine.previewFundingPayment(A,1);
        require(beforeClaim==15e18);uint256 available=vault.availableBalance(A,address(t));
        engine.executeAdl(A,1,1250e18);
        int256 cashFunding=int256(vault.availableBalance(A,address(t)))-int256(available)-int256(250e18);
        int256 afterClaim=engine.previewFundingPayment(A,1);
        emit FundingClaimObservation(beforeClaim,afterClaim,cashFunding,vault.fundingPoolBalance(address(t)));
        _assertBooks(t);require(afterClaim+cashFunding==beforeClaim,"ADL erased accrued receiver funding");
    }
    function testFinanceAdlMustPreserveAccruedPayerFundingDebt() public {
        _debtForAdl(false);engine.configureFunding(1,1e25);engine.updateFundingIndex(1,-int256(DELTA));
        int256 beforeClaim=engine.previewFundingPayment(A,1);require(beforeClaim==-15e18);
        engine.configureAdlSafety(1,true,2500);uint256 available=vault.availableBalance(A,address(t));
        engine.executeAdl(A,1,1250e18);
        int256 cashFunding=int256(vault.availableBalance(A,address(t)))-int256(available)-int256(250e18);
        int256 afterClaim=engine.previewFundingPayment(A,1);
        emit FundingClaimObservation(beforeClaim,afterClaim,cashFunding,vault.fundingPoolBalance(address(t)));
        _assertBooks(t);require(afterClaim+cashFunding==beforeClaim,"ADL erased accrued payer funding");
    }

}

