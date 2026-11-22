// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

// M20: six-decimal collateral integration in isolation; NEVER a production policy approval.
import {LQCFuturesMarketRegistry as Registry} from "../dex/contracts/futures/LQCFuturesMarketRegistry.sol";
import {LQCAggregatorOracleAdapter as Aggregator} from "../dex/contracts/futures/LQCAggregatorOracleAdapter.sol";
import {LQCPerpEngineM23AdmissionCandidate as Engine} from "../dex/contracts/futures/LQCPerpEngineM23AdmissionCandidate.sol";
import {LQCFuturesM23CollateralDepegGuard as Guard} from "../dex/contracts/futures/LQCFuturesM23CollateralDepegGuard.sol";
import {LQCFuturesVault as Vault} from "../dex/contracts/futures/LQCFuturesVault.sol";
import {MockPriceFeed as Feed} from "../dex/contracts/mocks/MockPriceFeed.sol";
import {M20MockCollateral6 as Token} from "./mocks/M20MockCollateral6.sol";

interface M20Vm {
    function warp(uint256 timestamp) external;
    function prank(address account) external;
    function expectRevert(bytes4 selector) external;
}
contract LQCFuturesM23DepegAdmissionTest {
    M20Vm private constant vm=M20Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    uint256 private constant START=2_000_000_000;
    address private constant INDEX=address(0xB7C);
    address private constant USER=address(0xB22);
    Token private token;
    Registry private registry;
    Vault private vault;
    Engine private engine;
    Feed private feed;
    Feed private collateralPrice;
    Feed private collateralReference;
    Guard private collateralGuard;

    function setUp() public {
        vm.warp(START);
        token=new Token();
        registry=new Registry(address(this));
        vault=new Vault(address(this));
        collateralPrice=new Feed(8,1e8);
        collateralReference=new Feed(8,1e8);
        collateralGuard=new Guard(address(token),address(collateralPrice),address(collateralReference),95e16,500);
        engine=new Engine(address(registry),address(vault),address(collateralGuard));
        vault.setEngine(address(engine));
        vault.setSupportedCollateral(address(token),true);
        Aggregator oracle=new Aggregator(address(this));
        feed=new Feed(8,50_000e8);
        oracle.setFeed(INDEX,address(feed),300);
        registry.addMarket("BTC/mUSD6",INDEX,address(token),address(oracle),100_000,500);
        (address source,uint32 heartbeat,address referenceFeed,uint16 deviation)=oracle.feedConfigs(INDEX);
        bytes32 config=keccak256(abi.encode(INDEX,source,heartbeat,referenceFeed,deviation));
        uint256 version=oracle.configVersion(INDEX);
        registry.approveAggregatorRecoveryOracle(1,address(oracle),address(oracle).codehash,config,version);
        registry.setMarketMode(1,Registry.MarketMode.REDUCE_ONLY);
        uint256 epoch=registry.recoveryApprovalEpoch(1);
        registry.approveRecoveryActivation(1,address(oracle),address(oracle).codehash,
            config,version,epoch,START+60);
        registry.activateMarket(1,epoch);
        token.mint(USER,3_000e6);
        vm.prank(USER);
        token.approve(address(vault),3_000e6);
        vm.prank(USER);
        vault.deposit(address(token),3_000e6);
    }

    function _assertConserved() internal view {
        uint256 available=vault.availableBalance(USER,address(token));
        uint256 locked=vault.lockedBalance(USER,address(token));
        uint256 accounted=vault.totalAccounted(address(token));
        uint256 reserved=vault.fundingPoolBalance(address(token))+
            vault.insuranceFeeReserve(address(token))+vault.treasuryFeeReserve(address(token));
        require(available+locked==accounted,"M21 user accounting mismatch");
        require(token.balanceOf(address(vault))>=accounted+reserved,"M21 underbacked");
    }

    function test_M21_Usd18NotionalWithSixDecimalMarginOpensAndChargesCorrectFee() public {
        engine.configureTradingFee(1,100,6000);
        vm.prank(USER);
        engine.openPosition(1,500e6,2_000e18,true);
        require(engine.openInterestUsd(1)==2_000e18,"M21 OI lost USD18 unit");
        require(vault.lockedBalance(USER,address(token))==500e6,"M21 6-decimal margin lost");
        require(vault.availableBalance(USER,address(token))==2_480e6,"M21 wrong 6-decimal fee debit");
        require(vault.insuranceFeeReserve(address(token))==12e6,"M21 Insurance 6 decimals wrong");
        require(vault.treasuryFeeReserve(address(token))==8e6,"M21 Treasury 6 decimals wrong");
        _assertConserved();
    }

    function test_M21_Usd18NonRepresentableDustIsRejected() public {
        uint256 beforeBalance=vault.availableBalance(USER,address(token));
        vm.expectRevert(Engine.NonRepresentableUsdAmount.selector);
        vm.prank(USER);
        engine.openPosition(1,500e6,2_000e18+1,true);
        require(vault.availableBalance(USER,address(token))==beforeBalance,
            "M21 failed dust amount changed balance");
        require(engine.openInterestUsd(1)==0,"M21 failed dust created OI");
        _assertConserved();
    }

    function test_M21_Usd18OpenFundingCloseAndWithdrawSixDecimal() public {
        // Demonstrates an alternate six-decimal common scale, not USD-e18 compatibility.
        engine.configureTradingFee(1,100,6000);
        engine.configureFunding(1,1e25);
        vm.prank(USER);
        engine.openPosition(1,500e6,2_000e18,true);
        require(vault.insuranceFeeReserve(address(token))==12e6,"M21 six-dec Insurance incorrect");
        require(vault.treasuryFeeReserve(address(token))==8e6,"M21 six-dec Treasury incorrect");
        require(vault.availableBalance(USER,address(token))==2_480e6,"M21 six-dec opening fee wrong");
        _assertConserved();

        engine.updateFundingIndex(1,int256(1e24));
        vm.prank(USER);
        engine.settleFunding(1);
        require(vault.fundingPoolBalance(address(token))==2e6,"M21 six-dec Funding debit incorrect");
        _assertConserved();

        feed.setAnswer(45_000e8); // 10% long loss = 200 six-dec synthetic units
        vm.prank(USER);
        engine.closePosition(1);
        require(engine.openInterestUsd(1)==0,"M21 six-dec position not cleared");
        require(vault.lockedBalance(USER,address(token))==0,"M21 six-dec margin locked after close");
        require(vault.insuranceFeeReserve(address(token))==24e6,"M21 six-dec close Insurance mismatch");
        require(vault.treasuryFeeReserve(address(token))==16e6,"M21 six-dec close Treasury mismatch");
        require(vault.fundingPoolBalance(address(token))==2e6,"M21 six-dec funding pool changed");
        require(vault.availableBalance(USER,address(token))==2_758e6,
            "M21 six-dec closed user balance incorrect");
        _assertConserved();

        vm.prank(USER);
        vault.withdraw(address(token),2_758e6);
        require(token.balanceOf(USER)==2_758e6,"M21 withdrawal settlement incorrect");
        require(vault.totalAccounted(address(token))==0,"M21 user liability retained");
        require(token.balanceOf(address(vault))==242e6,
            "M21 post-loss residual Vault balance incorrect");
        _assertConserved();
    }

    function test_M21_Usd18LiquidationWithSixDecimalInsuranceAndBadDebt() public {
        engine.configureTradingFee(1,100,6000);
        engine.configureInsuranceCoverage(1,5000);
        vm.prank(USER);
        engine.openPosition(1,500e6,2_000e18,true);
        feed.setAnswer(25_000e8);
        engine.liquidate(USER,1);
        (,,,,bool open)=engine.positions(USER,1);
        require(!open && engine.openInterestUsd(1)==0,"M21 liquidated USD18 OI still open");
        require(vault.lockedBalance(USER,address(token))==0,"M21 6-dec collateral stranded");
        require(vault.totalInsuranceCovered(address(token))==12e6,"M21 wrong insurance coverage");
        require(vault.residualBadDebt(address(token))==488e6,"M21 wrong 6-dec bad debt");
        require(vault.treasuryFeeReserve(address(token))==8e6,"M21 treasury touched by liquidation");
        require(vault.isFullyBacked(address(token)) && !vault.isSolvent(address(token)),
            "M21 debt solvency status incorrect");
        _assertConserved();
    }

    function test_M21_Usd18PartialLiquidationWithSixDecimalCash() public {
        engine.configurePartialLiquidation(1,5000,0);
        vm.prank(USER);
        engine.openPosition(1,500e6,2_000e18,true);
        feed.setAnswer(38_000e8);
        engine.liquidate(USER,1);
        (uint256 margin,uint256 size,,,bool open)=engine.positions(USER,1);
        require(open && size==1_000e18,"M21 partial liquidation USD18 OI wrong");
        require(margin==260e6,"M21 partial liquidation 6-dec margin wrong");
        require(engine.openInterestUsd(1)==1_000e18,"M21 partial OI ledger wrong");
        require(vault.lockedBalance(USER,address(token))==260e6,"M21 partial lock ledger wrong");
        require(vault.residualBadDebt(address(token))==0,"M21 partial liquid incurred unexpected bad debt");
        _assertConserved();
    }

    // M22 property: USD18 notation must preserve USD notionals while cash uses six decimals.
    function testFuzz_M22_RepresentableOpenFeeConservation(uint96 seedUsd,uint16 seedFeeBps) public {
        uint256 usd=uint256(seedUsd)%2_500 + 1;
        uint256 bps=uint256(seedFeeBps)%300 + 1;
        engine.configureTradingFee(1,bps,6000);
        uint256 margin=500e6;
        uint256 notional=usd*1e18;
        // With 10x risk limit and fixed 500 margin, all selected notional amounts fit.
        vm.prank(USER);
        engine.openPosition(1,margin,notional,true);
        uint256 expectedFee=(usd*1e6*bps)/10_000;
        require(engine.openInterestUsd(1)==notional,"M22 USD18 OI mismatch");
        require(vault.lockedBalance(USER,address(token))==margin,"M22 6-dec margin mismatch");
        require(vault.availableBalance(USER,address(token))==3_000e6-margin-expectedFee,
            "M22 6-dec charged fee mismatch");
        require(vault.insuranceFeeReserve(address(token))==expectedFee*6000/10_000,
            "M22 Insurance fraction mismatch");
        _assertConserved();
    }

    function testFuzz_M22_RepresentableUsd18PartialReductionConservation(uint32 seedSize,uint16 seedSlice) public {
        // In units of the native 6-decimal token, but USD notionals remain canonical 18 decimals.
        uint256 usd=uint256(seedSize)%1_500 + 501;
        uint256 part=uint256(seedSlice)%(usd-1)+1;
        vm.prank(USER);
        engine.openPosition(1,500e6,usd*1e18,true);
        vm.prank(USER);
        engine.reducePosition(1,part*1e18);
        require(engine.openInterestUsd(1)==(usd-part)*1e18,"M22 reduced OI mismatch");
        _assertConserved();
    }

    function testFuzz_M22_FundingOneIndexCheckpointCannotDoubleCharge(uint32 seedUnits) public {
        uint256 usd=uint256(seedUnits)%2_000+1;
        engine.configureFunding(1,1e25);
        vm.prank(USER);
        engine.openPosition(1,500e6,usd*1e18,true);
        engine.updateFundingIndex(1,int256(1e24));
        vm.prank(USER);
        engine.settleFunding(1);
        uint256 afterFirst=vault.totalAccounted(address(token));
        uint256 afterPool=vault.fundingPoolBalance(address(token));
        vm.prank(USER);
        engine.settleFunding(1);
        require(vault.totalAccounted(address(token))==afterFirst,
            "M22 repeated Funding incorrectly debited");
        require(vault.fundingPoolBalance(address(token))==afterPool,
            "M22 repeated Funding incorrectly credited");
        _assertConserved();
    }

    function test_M22_UnpricedCollateralDepegIsNotCoveredByUsd18Conversion() public {
        // Demonstrates a real design gap: no collateral/USD reference feed in M21.
        // A hypothetical depeg changes off-chain USD value but not token balance or risk checks.
        vm.prank(USER);
        engine.openPosition(1,500e6,2_000e18,true);
        uint256 marginTokens=vault.lockedBalance(USER,address(token));
        // Reference scenarios: token value of 1.00 USD vs 0.70 USD (no price feed set).
        uint256 assumedMarginAtParUsd18=marginTokens*1e12;
        uint256 hypotheticalMarginAt70CentsUsd18=assumedMarginAtParUsd18*70/100;
        require(hypotheticalMarginAt70CentsUsd18<assumedMarginAtParUsd18,
            "M22 depeg arithmetic invalid");
        require(engine.openInterestUsd(1)==2_000e18,
            "M22 hypothetical depeg changed OI without contract feed");
        require(registry.marketMode(1)==Registry.MarketMode.ACTIVE,
            "M22 collateral depeg unexpectedly triggered halt");
        _assertConserved();
        // PASS means the missing collateral-price enforcement was characterized, NOT mitigated.
    }

    function test_M23_DepegRevertsNewOpenBeforeLockAndFee() public {
        engine.configureTradingFee(1,100,6000);
        collateralPrice.setAnswer(90_000_000);
        collateralReference.setAnswer(90_000_000);
        vm.expectRevert(Engine.CollateralDepegAdmissionBlocked.selector);
        vm.prank(USER);
        engine.openPosition(1,500e6,2_000e18,true);
        require(vault.availableBalance(USER,address(token))==3_000e6,
            "M23 reverted open debited deposit");
        require(vault.lockedBalance(USER,address(token))==0,"M23 reverted open locked collateral");
        require(vault.insuranceFeeReserve(address(token))==0,"M23 reverted open charged fee");
        require(engine.openInterestUsd(1)==0,"M23 reverted open created OI");
        _assertConserved();
    }

    function test_M23_StaleCollateralSourceBlocksNewOpenWithoutMutation() public {
        collateralReference.setUpdatedAt(START-121);
        vm.expectRevert(Engine.CollateralDepegAdmissionBlocked.selector);
        vm.prank(USER);
        engine.openPosition(1,500e6,2_000e18,true);
        require(engine.openInterestUsd(1)==0,"M23 stale collateral permitted OI");
        require(vault.lockedBalance(USER,address(token))==0,"M23 stale collateral locked margin");
        _assertConserved();
    }

    function test_M23_CloseRemainsAvailableAfterCollateralDepeg() public {
        vm.prank(USER);
        engine.openPosition(1,500e6,2_000e18,true);
        collateralPrice.setAnswer(90_000_000);
        collateralReference.setAnswer(90_000_000);
        vm.prank(USER);
        engine.closePosition(1);
        (,,,,bool open)=engine.positions(USER,1);
        require(!open&&engine.openInterestUsd(1)==0,"M23 existing position could not exit");
        require(vault.lockedBalance(USER,address(token))==0,"M23 close margin locked");
        _assertConserved();
    }

    function test_M23_LiquidationStillAvailableAfterCollateralDepeg() public {
        vm.prank(USER);
        engine.openPosition(1,500e6,2_000e18,true);
        collateralPrice.setAnswer(90_000_000);
        collateralReference.setAnswer(90_000_000);
        feed.setAnswer(25_000e8);
        engine.liquidate(USER,1);
        (,,,,bool open)=engine.positions(USER,1);
        require(!open&&engine.openInterestUsd(1)==0,"M23 existing risky position not liquidatable");
        require(vault.lockedBalance(USER,address(token))==0,"M23 liquidated margin locked");
        _assertConserved();
    }
}
