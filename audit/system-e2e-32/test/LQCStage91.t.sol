// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {LQCLendingCore as Core} from "../src/lending/LQCLendingCore.sol";
import {LQCInterestRateModel as Rate} from "../src/lending/LQCInterestRateModel.sol";
import {LQCLendingInterestIndex as Index} from "../src/lending/LQCLendingInterestIndex.sol";
import {LQCLendingMarketRegistry as Registry} from "../src/lending/LQCLendingMarketRegistry.sol";
import {LQCOracleManager as Oracle} from "../src/lending/LQCOracleManager.sol";
import {LQCLiquidationEngine as Liquidation} from "../src/lending/LQCLiquidationEngine.sol";
import {MockERC20} from "../src/mocks/MockERC20.sol";
import {MockPriceFeed} from "./MockPriceFeed.sol";

interface VmStage91 {
    function prank(address sender) external;
    function warp(uint256 timestamp) external;
    function expectRevert(bytes4 selector) external;
}

contract LQCStage91Test {
    VmStage91 private constant vm = VmStage91(address(uint160(uint256(keccak256("hevm cheat code")))));
    address private constant BORROWER = address(0xB0);
    address private constant LENDER = address(0x1E);
    address private constant LIQUIDATOR = address(0x11);
    uint256 private constant PRINCIPAL = 100 ether;

    MockERC20 private collateral;
    MockERC20 private debt;
    MockPriceFeed private colPrimary;
    MockPriceFeed private colReference;
    MockPriceFeed private debtPrimary;
    MockPriceFeed private debtReference;
    Core private core;
    Registry private registry;
    Rate private rate;
    Index private index;
    Liquidation private liquidation;
    bytes32 private market;

    address private constant LENDER_B = address(0xB101);
    address private constant BORROWER_B = address(0xB102);
    event SharedCash(uint256 marketA, uint256 marketB, uint256 unallocated, uint256 physical);
    event Accounting(string stage, uint256 cash, uint256 borrow, uint256 supply, uint256 reserves);

    function setUp() external {
        vm.warp(1_800_000_000);
        collateral = new MockERC20("Collateral", "COL");
        debt = new MockERC20("Debt", "DEBT");
        colPrimary = new MockPriceFeed(8, 100e8);
        colReference = new MockPriceFeed(8, 100e8);
        debtPrimary = new MockPriceFeed(8, 1e8);
        debtReference = new MockPriceFeed(8, 1e8);
        Oracle oracle = new Oracle(address(this), address(this));
        oracle.configureAsset(address(collateral), address(colPrimary), address(colReference), 3600, 200);
        oracle.configureAsset(address(debt), address(debtPrimary), address(debtReference), 3600, 200);
        registry = new Registry(address(this), address(this), address(oracle));
        market = registry.configureMarket(Registry.MarketConfig(
            address(collateral), address(debt), 18, 18, 5000, 7000, 500, 1_000 ether, 500 ether, 1 ether, true
        ));
        rate = new Rate(address(this), address(this));
        rate.configureRate(market, Rate.RateConfig(200, 800, 9000, 8000, 1000, true));
        index = new Index(address(this), address(rate));
        index.initializeMarket(market);
        core = new Core(address(this), address(registry), address(index));
        index.setCore(address(core));
        liquidation = new Liquidation(address(core));
        core.setLiquidationEngine(address(liquidation));

        debt.mint(LENDER, PRINCIPAL);
        debt.mint(BORROWER, 50 ether);
        debt.mint(LIQUIDATOR, PRINCIPAL);
        collateral.mint(BORROWER, 3 ether);
        vm.prank(LENDER);
        debt.approve(address(core), PRINCIPAL);
        vm.prank(BORROWER);
        debt.approve(address(core), 150 ether);
        vm.prank(LIQUIDATOR);
        debt.approve(address(core), PRINCIPAL);
        vm.prank(BORROWER);
        collateral.approve(address(core), 3 ether);
        vm.prank(LENDER);
        core.supplyLiquidity(market, PRINCIPAL);
        vm.prank(BORROWER);
        core.depositCollateral(market, 3 ether);
    }

    function test_AtAndAboveFullUtilizationReturnSameRates() external view {
        (uint256 borrow, uint256 supply, uint256 utilization) = rate.rates(market, 100, 100);
        require(utilization == rate.RAY() && borrow > supply && supply > 0);
        (uint256 excessBorrow, uint256 excessSupply, uint256 excessUtilization) =
            rate.rates(market, type(uint256).max, 100);
        require(excessUtilization == utilization && excessBorrow == borrow && excessSupply == supply);
        (,, uint256 belowCap) = rate.rates(market, 99, 100);
        require(belowCap == 99 * rate.RAY() / 100);
    }

    function test_ZeroSupplyTreatsEmptyAndIndebtedMarketsDifferently() external view {
        (, uint256 emptySupply, uint256 emptyUtilization) = rate.rates(market, 0, 0);
        require(emptySupply == 0 && emptyUtilization == 0);
        (uint256 borrow, uint256 supply, uint256 utilization) = rate.rates(market, 1, 0);
        (uint256 fullBorrow, uint256 fullSupply, uint256 fullUtilization) = rate.rates(market, 1, 1);
        require(utilization == fullUtilization && borrow == fullBorrow && supply == fullSupply);
    }

    function test_FinalCashBorrowAccruesTwiceAndAllowsRepayAndWithdrawal() external {
        _borrow(PRINCIPAL);
        require(core.availableLiquidity(market) == 0 && core.debtOf(market, BORROWER) == PRINCIPAL);
        _expectCashExhausted();
        _accrueAtFullUtilizationTwice();
        _expectCashExhausted();

        uint256 beforeDebt = core.debtOf(market, BORROWER);
        uint256 beforeBalance = debt.balanceOf(BORROWER);
        vm.prank(BORROWER);
        uint256 paid = core.repay(market, 40 ether, BORROWER);
        require(paid != 0 && paid <= 40 ether);
        require(beforeBalance - debt.balanceOf(BORROWER) == paid);
        require(core.debtOf(market, BORROWER) < beforeDebt && core.debtOf(market, BORROWER) != 0);
        _reconcile("partial repayment");

        uint256 remaining = core.debtOf(market, BORROWER);
        vm.prank(BORROWER);
        require(core.repay(market, remaining, BORROWER) == remaining);
        require(core.debtSharesOf(market, BORROWER) == 0 && core.totalBorrow(market) == 0);
        _reconcile("full repayment");

        vm.prank(BORROWER);
        core.withdrawCollateral(market, 3 ether, BORROWER);
        require(collateral.balanceOf(BORROWER) == 3 ether && collateral.balanceOf(address(core)) == 0);
        uint256 claim = core.liquidityOf(market, LENDER);
        vm.prank(LENDER);
        core.withdrawLiquidity(market, claim, LENDER);
        require(debt.balanceOf(LENDER) == claim && core.liquiditySharesOf(market, LENDER) == 0);
        _reconcile("withdrawals complete");
        uint256 reserves = core.accruedReserves(market);
        core.withdrawReserves(market, reserves, address(this));
        require(debt.balanceOf(address(this)) == reserves && core.marketCash(market) == 0);
        _reconcile("reserve withdrawal complete");
    }

    function test_ExhaustedMarketStillLiquidatesAndRecordsUncoveredDebt() external {
        _borrow(PRINCIPAL);
        _accrueAtFullUtilizationTwice();
        colPrimary.setAnswer(10e8);
        colReference.setAnswer(10e8);
        debtPrimary.setAnswer(1e8);
        debtReference.setAnswer(1e8);

        uint256 debtBefore = core.debtOf(market, BORROWER);
        uint256 paymentBalance = debt.balanceOf(LIQUIDATOR);
        vm.prank(LIQUIDATOR);
        (uint256 repaid, uint256 seized) = liquidation.liquidate(market, BORROWER, PRINCIPAL, LIQUIDATOR);
        require(repaid != 0 && repaid <= debtBefore / 2 && seized == 3 ether);
        require(core.availableLiquidity(market) == repaid && debt.balanceOf(LIQUIDATOR) == paymentBalance - repaid);
        require(collateral.balanceOf(LIQUIDATOR) == seized && core.collateralOf(market, BORROWER) == 0);
        uint256 badDebt = core.badDebtOf(market, BORROWER);
        require(badDebt != 0 && badDebt == core.debtOf(market, BORROWER));
        require(core.badDebtSharesOf(market, BORROWER) == core.totalBadDebtShares(market));
        _reconcile("liquidation");
    }

    function test_ReserveLossAndRecapitalizationUseOnlyAffectedMarket() external {
        bytes32 marketB = _marketB();
        _borrow(PRINCIPAL);
        _accrueAtFullUtilizationTwice();
        uint256 reserves = core.accruedReserves(market);
        vm.expectRevert(Core.InsufficientReserves.selector);
        core.withdrawReserves(market, reserves, address(this));
        _checkShared(marketB, 0, PRINCIPAL, 0);

        colPrimary.setAnswer(10e8);
        colReference.setAnswer(10e8);
        debtPrimary.setAnswer(1e8);
        debtReference.setAnswer(1e8);
        vm.prank(LIQUIDATOR);
        (uint256 recovered,) = liquidation.liquidate(market, BORROWER, PRINCIPAL, LIQUIDATOR);
        uint256 bad = core.badDebtOf(market, BORROWER);
        vm.expectRevert(Core.OutstandingBadDebt.selector);
        core.withdrawReserves(market, reserves, address(this));

        uint256 covered = core.coverBadDebtWithReserves(market, BORROWER, reserves / 2);
        require(covered != 0 && core.accruedReserves(market) == reserves - covered);
        _checkShared(marketB, recovered, PRINCIPAL, 0);

        uint256 supplyBefore = core.totalLiquidity(market);
        registry.setMarketEnabled(market, false);
        uint256 writtenOff = core.realizeBadDebtLoss(market, BORROWER, 1 ether);
        require(writtenOff != 0 && core.badDebtOf(market, BORROWER) < bad);
        require(core.accruedReserves(market) < reserves && core.totalLiquidity(market) < supplyBefore);
        _checkShared(marketB, recovered, PRINCIPAL, 0);

        debt.mint(address(this), 2 ether);
        debt.approve(address(core), 2 ether);
        uint256 recap = core.recapitalizeBadDebt(market, BORROWER, 2 ether);
        require(recap != 0 && recap <= 2 ether);
        require(core.liquidityOf(marketB, LENDER_B) == PRINCIPAL && core.totalBorrow(marketB) == 0);
        _checkShared(marketB, recovered + recap, PRINCIPAL, 0);
    }

    function _initializeMarket(address collateralToken, address debtToken) private returns (bytes32 id) {
        id = registry.configureMarket(Registry.MarketConfig(
            collateralToken, debtToken, 18, 18, 5000, 7000, 500, 1_000 ether, 500 ether, 1 ether, true
        ));
        rate.configureRate(id, Rate.RateConfig(200, 800, 9000, 8000, 1000, true));
        index.initializeMarket(id);
    }

    function _marketB() private returns (bytes32 id) {
        MockERC20 otherCollateral = new MockERC20("Collateral B", "COLB");
        Oracle(address(registry.oracle())).configureAsset(
            address(otherCollateral), address(colPrimary), address(colReference), 3600, 200
        );
        id = _initializeMarket(address(otherCollateral), address(debt));
        debt.mint(LENDER_B, PRINCIPAL);
        vm.prank(LENDER_B);
        debt.approve(address(core), PRINCIPAL);
        vm.prank(LENDER_B);
        core.supplyLiquidity(id, PRINCIPAL);
        otherCollateral.mint(BORROWER_B, 3 ether);
        vm.prank(BORROWER_B);
        otherCollateral.approve(address(core), 3 ether);
        vm.prank(BORROWER_B);
        core.depositCollateral(id, 3 ether);
    }

    function _checkShared(bytes32 id, uint256 cashA, uint256 cashB, uint256 unallocated) private {
        require(core.marketCash(market) == cashA && core.availableLiquidity(market) == cashA);
        require(core.marketCash(id) == cashB && core.availableLiquidity(id) == cashB);
        require(core.accountedTokenBalance(address(debt)) == cashA + cashB);
        require(core.unallocatedTokenBalance(address(debt)) == unallocated);
        uint256 physical = debt.balanceOf(address(core));
        require(physical == cashA + cashB + unallocated);
        emit SharedCash(cashA, cashB, unallocated, physical);
    }

    function _borrow(uint256 amount) private {
        vm.prank(BORROWER);
        core.borrow(market, amount, BORROWER);
    }

    function _expectCashExhausted() private {
        vm.expectRevert(Core.InsufficientLiquidity.selector);
        vm.prank(BORROWER);
        core.borrow(market, 1, BORROWER);
        vm.expectRevert(Core.InsufficientLiquidity.selector);
        vm.prank(LENDER);
        core.withdrawLiquidity(market, 1, LENDER);
    }

    function _accrueAtFullUtilizationTwice() private {
        vm.warp(block.timestamp + 30 days);
        core.accrueInterest(market);
        // First update yields more borrower interest than supplier interest at 100%.
        (uint128 b, uint128 s,) = index.indexStates(market);
        require(b > s && core.accruedReserves(market) != 0);
        vm.warp(block.timestamp + 30 days);
        uint256 debtPreview = core.totalBorrow(market);
        uint256 supplyPreview = core.totalLiquidity(market);
        core.accrueInterest(market);
        require(core.totalBorrow(market) == debtPreview && core.totalLiquidity(market) == supplyPreview);
        require(debtPreview > supplyPreview);
        _reconcile("second full-utilization accrual");
    }

    function _reconcile(string memory stage) private {
        uint256 cash = core.marketCash(market);
        uint256 borrowed = core.totalBorrow(market);
        uint256 supplied = core.totalLiquidity(market);
        uint256 reserves = core.accruedReserves(market);
        uint256 assets = cash + borrowed;
        uint256 claims = supplied + reserves;
        require(assets == claims);
        require(core.availableLiquidity(market) == core.marketCash(market));
        require(debt.balanceOf(address(core)) == core.accountedTokenBalance(address(debt))
            + core.unallocatedTokenBalance(address(debt)));
        require(core.accountedTokenBalance(address(collateral)) == collateral.balanceOf(address(core)));
        require(borrowed == core.debtOf(market, BORROWER) && supplied == core.liquidityOf(market, LENDER));
        (uint128 totalCollateral, uint128 totalSupplyShares, uint128 totalDebtShares) = core.marketStates(market);
        require(totalCollateral == collateral.balanceOf(address(core)) && totalCollateral == core.collateralOf(market, BORROWER));
        require(totalSupplyShares == core.liquiditySharesOf(market, LENDER)
            && totalDebtShares == core.debtSharesOf(market, BORROWER));
        emit Accounting(stage, cash, borrowed, supplied, reserves);
    }
}
