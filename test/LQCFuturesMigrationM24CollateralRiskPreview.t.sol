// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;
import {LQCFuturesM24CollateralRiskPreview as Risk} from "../dex/contracts/futures/LQCFuturesM24CollateralRiskPreview.sol";
import {MockPriceFeed as Feed} from "../dex/contracts/mocks/MockPriceFeed.sol";

interface M24Vm {
    function warp(uint256 time) external;
    function expectRevert(bytes4 selector) external;
}
contract LQCFuturesM24CollateralRiskPreviewTest {
    M24Vm private constant vm=M24Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    uint256 private constant T=2_000_000_000;
    Feed private primary;
    Feed private referenceFeed;
    Risk private risk;
    function setUp() public {
        vm.warp(T);
        primary=new Feed(8,100_000_000);
        referenceFeed=new Feed(8,100_000_000);
        risk=new Risk(address(primary),address(referenceFeed),500);
    }
    function _setPrices(int256 quote8) private {
        primary.setAnswer(quote8);
        referenceFeed.setAnswer(quote8);
    }
    function test_M24_AtParNotLiquidatableForSixAndEighteenDecimals() public {
        (int256 a,uint256 ma,bool la)=risk.preview(500e6,6,2_000e18,50_000e18,50_000e18,true,500);
        (int256 b,uint256 mb,bool lb)=risk.preview(500e18,18,2_000e18,50_000e18,50_000e18,true,500);
        require(a==500e18&&b==a,"M24 at-par valuations differ");
        require(ma==100e18&&mb==ma&&!la&&!lb,"M24 at-par liquidation wrong");
    }
    function test_M24_DepegAt90CentsChangesUsdEquityWithoutForcingLiquidation() public {
        _setPrices(90_000_000);
        (int256 eq,uint256 maintenance,bool eligible)=risk.preview(
            500e6,6,2_000e18,50_000e18,50_000e18,true,500);
        require(eq==450e18&&maintenance==100e18&&!eligible,
            "M24 price-adjusted 90-cent margin wrong");
    }
    function test_M24_DepegChangesLiquidationThresholdAtSameIndexPrice() public {
        // Long with 20% loss: 2000 USD notional => -400 USD PnL.
        // At par: 500 - 400 = 100 exactly maintenance.
        // At 90 cents: 450 - 400 = 50 below maintenance.
        (int256 parEq,uint256 parM,bool parLiq)=risk.preview(
            500e6,6,2_000e18,50_000e18,40_000e18,true,500);
        _setPrices(90_000_000);
        (int256 depEq,uint256 depM,bool depLiq)=risk.preview(
            500e6,6,2_000e18,50_000e18,40_000e18,true,500);
        require(parEq==100e18&&parM==100e18&&parLiq,"M24 par threshold equality wrong");
        require(depEq==50e18&&depM==100e18&&depLiq,"M24 depeg threshold wrong");
    }
    function test_M24_FeedPriceBelowAdmissionFloorStillValuableForRiskPreview() public {
        _setPrices(70_000_000); // below separate M23 admission floor of $0.95
        (int256 eq,uint256 maintenance,bool liq)=risk.preview(
            500e6,6,2_000e18,50_000e18,40_000e18,true,500);
        require(eq==-50e18&&maintenance==100e18&&liq,
            "M24 below-floor collateral must be risk valued rather than discarded");
    }
    function test_M24_StaleOrFutureOrDivergentOracleFailsClosed() public {
        primary.setUpdatedAt(T-121);
        vm.expectRevert(Risk.InvalidCollateralQuote.selector);
        risk.preview(500e6,6,2_000e18,50_000e18,40_000e18,true,500);
        primary.setUpdatedAt(T);
        referenceFeed.setUpdatedAt(T+1);
        vm.expectRevert(Risk.InvalidCollateralQuote.selector);
        risk.preview(500e6,6,2_000e18,50_000e18,40_000e18,true,500);
        referenceFeed.setUpdatedAt(T);
        primary.setAnswer(90_000_000);
        referenceFeed.setAnswer(100_000_000);
        vm.expectRevert(Risk.InvalidCollateralQuote.selector);
        risk.preview(500e6,6,2_000e18,50_000e18,40_000e18,true,500);
    }
    function test_M24_UnsupportedDecimalsAndInvalidPositionsFailClosed() public {
        vm.expectRevert(Risk.UnsupportedDecimals.selector);
        risk.preview(500e8,8,2_000e18,50_000e18,50_000e18,true,500);
        vm.expectRevert(Risk.InvalidPosition.selector);
        risk.preview(500e6,6,0,50_000e18,50_000e18,true,500);
    }
    function test_M24_ConservativeLowerOfTwoPricesIsUsed() public {
        primary.setAnswer(98_000_000);
        referenceFeed.setAnswer(100_000_000);
        require(risk.collateralUsd18()==98e16,"M24 should value at lower quote");
        (int256 eq,,)=risk.preview(500e6,6,2_000e18,50_000e18,50_000e18,true,500);
        require(eq==490e18,"M24 did not apply lower quote");
    }
    function testFuzz_M24_SixAndEighteenDecimalsAgreeOnRiskValuation(uint16 seedUsd,uint8 seedPrice) public {
        uint256 margin=uint256(seedUsd)%2_000+1;
        uint256 cents=uint256(seedPrice)%101;
        if(cents==0)cents=1;
        int256 price8=int256(cents*1_000_000);
        _setPrices(price8);
        (int256 eq6,uint256 maint6,bool eligible6)=risk.preview(
            margin*1e6,6,2_000e18,50_000e18,40_000e18,true,500);
        (int256 eq18,uint256 maint18,bool eligible18)=risk.preview(
            margin*1e18,18,2_000e18,50_000e18,40_000e18,true,500);
        require(eq6==eq18&&maint6==maint18&&eligible6==eligible18,
            "M24 cross-decimal risk valuation disagreement");
    }
    function testFuzz_M24_LowerCollateralPriceCannotRaiseEquity(uint8 a,uint8 b) public {
        uint256 low=uint256(a)%100+1;
        uint256 high=uint256(b)%100+1;
        if(low>high){uint256 tmp=low;low=high;high=tmp;}
        _setPrices(int256(low*1_000_000));
        (int256 lowEq,,)=risk.preview(500e6,6,2_000e18,50_000e18,40_000e18,true,500);
        _setPrices(int256(high*1_000_000));
        (int256 highEq,,)=risk.preview(500e6,6,2_000e18,50_000e18,40_000e18,true,500);
        require(lowEq<=highEq,"M24 depegging raised equity");
    }
}
