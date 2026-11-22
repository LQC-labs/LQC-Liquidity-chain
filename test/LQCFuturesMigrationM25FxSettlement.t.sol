// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {LQCFuturesM25FxSettlementPreview as Fx} from "../dex/contracts/futures/LQCFuturesM25FxSettlementPreview.sol";
import {LQCFuturesM24CollateralRiskPreview as Risk} from "../dex/contracts/futures/LQCFuturesM24CollateralRiskPreview.sol";
import {MockPriceFeed as Feed} from "../dex/contracts/mocks/MockPriceFeed.sol";

interface M25Vm {
    function warp(uint256 timestamp) external;
    function expectRevert(bytes4 selector) external;
}

contract LQCFuturesM25FxSettlementTest {
    M25Vm private constant vm=M25Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    uint256 private constant START=2_000_000_000;
    Feed private primary;
    Feed private secondary;
    Risk private risk;
    Fx private fx;

    function setUp() public {
        vm.warp(START);
        primary=new Feed(8,100_000_000);
        secondary=new Feed(8,100_000_000);
        risk=new Risk(address(primary),address(secondary),500);
        fx=new Fx(address(risk));
    }

    function _setPrice(uint256 cents) private {
        primary.setAnswer(int256(cents*1e6));
        secondary.setAnswer(int256(cents*1e6));
    }

    function test_M25_At80Cents100UsdLossRequires125Tokens() public {
        _setPrice(80);
        require(fx.lossToTokensCeil(100e18,6)==125e6,"M25 six decimal loss incorrect");
        require(fx.lossToTokensCeil(100e18,18)==125e18,"M25 eighteen decimal loss incorrect");
        require(fx.profitToTokensFloor(100e18,6)==125e6,"M25 profit conversion incorrect");
    }

    function test_M25_DepegDeficitUsesOnlyMarginAndBoundedInsurance() public {
        _setPrice(80);
        Fx.LossResult memory r=fx.simulateLoss(600e18,6,500e6,20e6,10e6,7e6,10000);
        require(r.requiredTokens==750e6,"M25 loss FX conversion wrong");
        require(r.consumedMargin==500e6&&r.marginRemaining==0,"M25 margin wrong");
        require(r.insuredTokens==20e6&&r.insuranceRemaining==0,"M25 Insurance wrong");
        require(r.residualBadDebt==230e6,"M25 residual debt hidden");
        require(r.treasuryUnchanged==10e6&&r.fundingUnchanged==7e6,
            "M25 Treasury/Funding spent");
    }

    function test_M25_ZeroInsuranceCapLeavesReserveAndTracksDebt() public {
        _setPrice(80);
        Fx.LossResult memory r=fx.simulateLoss(600e18,6,500e6,20e6,10e6,7e6,0);
        require(r.residualBadDebt==250e6&&r.insuredTokens==0,"M25 zero Insurance cap wrong");
        require(r.insuranceRemaining==20e6&&r.treasuryUnchanged==10e6,
            "M25 unapproved reserve used");
    }

    function test_M25_InsuranceCoverageCapIsAppliedAfterMarginDeficit() public {
        _setPrice(80);
        Fx.LossResult memory r=fx.simulateLoss(600e18,6,500e6,200e6,10e6,7e6,5000);
        require(r.insuredTokens==125e6&&r.residualBadDebt==125e6,
            "M25 bounded 50% Insurance coverage wrong");
        require(r.insuranceRemaining==75e6,"M25 Insurance remaining wrong");
    }

    function test_M25_RoundLossUpButProfitDownAtSixDecimals() public {
        _setPrice(80);
        uint256 oneDollarPlusFraction=1e18+1;
        uint256 loss=fx.lossToTokensCeil(oneDollarPlusFraction,6);
        uint256 profit=fx.profitToTokensFloor(oneDollarPlusFraction,6);
        require(loss==1_250_001&&profit==1_250_000,"M25 rounding direction wrong");
        require(loss==profit+1,"M25 rounding bias not preserved");
    }

    function test_M25_ProfitMustHaveAvailableUnreservedLiquidity() public {
        _setPrice(80);
        vm.expectRevert(Fx.InadequateProfitLiquidity.selector);
        fx.simulateProfit(100e18,6,124e6);
        require(fx.simulateProfit(100e18,6,125e6)==125e6,
            "M25 covered profit preview incorrect");
    }

    function test_M25_StaleOrDivergentFeedFailsClosed() public {
        _setPrice(80);
        primary.setUpdatedAt(START-121);
        vm.expectRevert(Risk.InvalidCollateralQuote.selector);
        fx.simulateLoss(100e18,6,100e6,10e6,1,1,10000);
        primary.setUpdatedAt(START);
        secondary.setAnswer(100_000_000);
        vm.expectRevert(Risk.InvalidCollateralQuote.selector);
        fx.lossToTokensCeil(100e18,6);
    }

    function test_M25_UnsupportedDecimalsAndInvalidCoverageRejected() public {
        vm.expectRevert(Fx.UnsupportedDecimals.selector);
        fx.lossToTokensCeil(100e18,8);
        vm.expectRevert(Fx.InvalidInput.selector);
        fx.simulateLoss(100e18,6,100e6,10e6,1,1,10001);
    }

    function testFuzz_M25_SixVsEighteenDecimalEconomicEquivalence(uint16 seedUsd,uint8 seedCents) public {
        uint256 usd=uint256(seedUsd)%5000+1;
        uint256 cents=uint256(seedCents)%100+1;
        _setPrice(cents);
        uint256 six=fx.lossToTokensCeil(usd*1e18,6);
        uint256 eighteen=fx.lossToTokensCeil(usd*1e18,18);
        require((eighteen+1e12-1)/1e12==six,"M25 precision equivalents diverged");
    }

    function testFuzz_M25_LowerCollateralPriceNeverLowersLossTokenRequirement(uint16 seedUsd,uint8 a,uint8 b) public {
        uint256 usd=uint256(seedUsd)%5000+1;
        uint256 low=uint256(a)%100+1;
        uint256 high=uint256(b)%100+1;
        if(low>high){uint256 tmp=low;low=high;high=tmp;}
        _setPrice(low);
        uint256 lowLoss=fx.lossToTokensCeil(usd*1e18,6);
        _setPrice(high);
        uint256 highLoss=fx.lossToTokensCeil(usd*1e18,6);
        require(lowLoss>=highLoss,"M25 lower collateral FX price reduced debt tokens");
    }

    function testFuzz_M25_LossWaterfallConservesEveryRequiredUnit(
        uint16 seedUsd,uint16 seedMargin,uint16 seedInsurance,uint8 seedCoverage
    ) public {
        _setPrice(80);
        uint256 lossUsd=(uint256(seedUsd)%2500+1)*1e18;
        uint256 margin=uint256(seedMargin)*1e6;
        uint256 insurance=uint256(seedInsurance)*1e6;
        uint16 coverage=uint16(uint256(seedCoverage)*10000/255);
        Fx.LossResult memory r=fx.simulateLoss(lossUsd,6,margin,insurance,123e6,25e6,coverage);
        require(r.requiredTokens==r.consumedMargin+r.insuredTokens+r.residualBadDebt,
            "M25 required tokens not reconciled");
        require(r.marginRemaining+r.consumedMargin==margin,"M25 margin not conserved");
        require(r.insuranceRemaining+r.insuredTokens==insurance,"M25 Insurance not conserved");
        require(r.treasuryUnchanged==123e6&&r.fundingUnchanged==25e6,
            "M25 protected reserves changed");
    }
}
