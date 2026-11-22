// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

// M09: test-only parallel Futures stacks. No historical on-chain deployment or asset migration.
import {LQCFuturesMarketRegistry as Registry} from "../dex/contracts/futures/LQCFuturesMarketRegistry.sol";
import {LQCAggregatorOracleAdapter as Aggregator} from "../dex/contracts/futures/LQCAggregatorOracleAdapter.sol";
import {LQCPerpEngineM21Usd18Candidate as Engine} from "../dex/contracts/futures/LQCPerpEngineM21Usd18Candidate.sol";
import {LQCFuturesVault as Vault} from "../dex/contracts/futures/LQCFuturesVault.sol";
import {MockPriceFeed as Feed} from "../dex/contracts/mocks/MockPriceFeed.sol";
import {MockERC20} from "../dex/contracts/mocks/MockERC20.sol";

interface M09Vm {
    function warp(uint256 timestamp) external;
    function prank(address sender) external;
    function expectRevert(bytes4 selector) external;
}

contract LQCFuturesM21Usd18RegressionTest {
    M09Vm private constant vm = M09Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    uint256 private constant START = 2_000_000_000;
    address private constant INDEX = address(0xB7C);
    address private constant OLD_USER = address(0xA11);
    address private constant NEW_USER = address(0xB22);

    MockERC20 private token;
    Registry private oldRegistry;
    Registry private newRegistry;
    Vault private oldVault;
    Vault private newVault;
    Engine private oldEngine;
    Engine private newEngine;
    Feed private newFeed;

    function setUp() public {
        vm.warp(START);
        token = new MockERC20("Research test collateral", "tUSD");
        (oldRegistry, oldVault, oldEngine) = _stack();
        (newRegistry, newVault, newEngine) = _stack();

        // Establish historical-like state: one position opened and closed at same quote.
        _fund(OLD_USER, oldVault, 5_000e18);
        vm.prank(OLD_USER);
        oldEngine.openPosition(1, 1_000e18, 5_000e18, true);
        vm.prank(OLD_USER);
        oldEngine.closePosition(1);
        require(oldVault.availableBalance(OLD_USER, address(token)) == 5_000e18,
            "historic-like available balance not preserved");
        require(oldVault.lockedBalance(OLD_USER, address(token)) == 0, "old locked balance not zero");
    }

    function _stack() private returns (Registry registry, Vault vault, Engine engine) {
        registry = new Registry(address(this));
        vault = new Vault(address(this));
        engine = new Engine(address(registry), address(vault));
        vault.setEngine(address(engine));
        vault.setSupportedCollateral(address(token), true);

        Aggregator oracle = new Aggregator(address(this));
        Feed feed = new Feed(8, 50_000e8);
        if (address(oldRegistry) != address(0)) newFeed = feed;
        oracle.setFeed(INDEX, address(feed), 300);
        registry.addMarket("BTC/tUSD", INDEX, address(token), address(oracle), 100_000, 500);
        (address baseFeed, uint32 heartbeat, address referenceFeed, uint16 deviation) = oracle.feedConfigs(INDEX);
        bytes32 config = keccak256(abi.encode(INDEX, baseFeed, heartbeat, referenceFeed, deviation));
        uint256 version = oracle.configVersion(INDEX);
        registry.approveAggregatorRecoveryOracle(1, address(oracle), address(oracle).codehash, config, version);
        registry.setMarketMode(1, Registry.MarketMode.REDUCE_ONLY);
        uint256 epoch = registry.recoveryApprovalEpoch(1);
        registry.approveRecoveryActivation(1, address(oracle), address(oracle).codehash,
            config, version, epoch, START + 60);
        registry.activateMarket(1, epoch);
    }

    function _fund(address user, Vault vault, uint256 amount) private {
        token.mint(user, amount);
        vm.prank(user);
        token.approve(address(vault), amount);
        vm.prank(user);
        vault.deposit(address(token), amount);
    }

    function test_M09_ParallelNewStackDoesNotMutateExistingAccountOrVault() public {
        require(address(oldVault) != address(newVault) &&
            address(oldEngine) != address(newEngine) &&
            address(oldRegistry) != address(newRegistry), "stack contracts reused");

        uint256 legacyAccounted = oldVault.totalAccounted(address(token));
        uint256 legacyAvailable = oldVault.availableBalance(OLD_USER, address(token));
        uint256 legacyTokenBalance = token.balanceOf(address(oldVault));
        uint256 oldOI = oldEngine.openInterestUsd(1);

        _fund(NEW_USER, newVault, 3_000e18);
        vm.prank(NEW_USER);
        newEngine.openPosition(1, 500e18, 2_000e18, false);

        require(oldVault.engine() == address(oldEngine), "legacy Vault Engine changed");
        require(newVault.engine() == address(newEngine), "new Vault Engine incorrect");
        require(oldVault.totalAccounted(address(token)) == legacyAccounted, "legacy accounting changed");
        require(oldVault.availableBalance(OLD_USER, address(token)) == legacyAvailable,
            "legacy rights changed");
        require(token.balanceOf(address(oldVault)) == legacyTokenBalance, "legacy custody changed");
        require(oldEngine.openInterestUsd(1) == oldOI && newEngine.openInterestUsd(1) == 2_000e18,
            "cross-domain OI changed");
        (,,,, bool openedOld) = newEngine.positions(OLD_USER, 1);
        (,,,, bool openedNew) = newEngine.positions(NEW_USER, 1);
        require(!openedOld && openedNew, "old position imported or new position absent");
        require(newVault.lockedBalance(NEW_USER, address(token)) == 500e18, "new lock incorrect");
    }

    function test_M09_LegacyWithdrawalWorksAfterNewStackActivity() public {
        _fund(NEW_USER, newVault, 3_000e18);
        vm.prank(NEW_USER);
        newEngine.openPosition(1, 500e18, 2_000e18, true);

        uint256 newAccounted = newVault.totalAccounted(address(token));
        uint256 newLocked = newVault.lockedBalance(NEW_USER, address(token));
        uint256 newVaultTokenBalance = token.balanceOf(address(newVault));
        uint256 oldBalanceBefore = token.balanceOf(OLD_USER);

        vm.prank(OLD_USER);
        oldVault.withdraw(address(token), 5_000e18);

        require(oldVault.availableBalance(OLD_USER, address(token)) == 0, "old withdrawal not cleared");
        require(oldVault.totalAccounted(address(token)) == 0, "old accounted value not reduced");
        require(token.balanceOf(address(oldVault)) == 0, "old Vault custody not reduced");
        require(token.balanceOf(OLD_USER) == oldBalanceBefore + 5_000e18,
            "old user withdrawal not received");
        require(newVault.totalAccounted(address(token)) == newAccounted &&
            newVault.lockedBalance(NEW_USER, address(token)) == newLocked &&
            token.balanceOf(address(newVault)) == newVaultTokenBalance,
            "new independent stack altered by old withdrawal");
    }

    function test_M15_FeesInsuranceAndFundingPreserveLegacyAccounting() public {
        uint256 oldAccounted = oldVault.totalAccounted(address(token));
        uint256 oldAvailable = oldVault.availableBalance(OLD_USER, address(token));
        uint256 oldCustody = token.balanceOf(address(oldVault));
        newEngine.configureTradingFee(1, 100, 6000); // 1% fee; 60% fee to Insurance.
        newEngine.configureFunding(1, 1e25);
        _fund(NEW_USER, newVault, 3_000e18);

        vm.prank(NEW_USER);
        newEngine.openPosition(1, 500e18, 2_000e18, true);
        require(newVault.insuranceFeeReserve(address(token)) == 12e18, "Insurance fee wrong");
        require(newVault.treasuryFeeReserve(address(token)) == 8e18, "Treasury fee wrong");
        require(newVault.totalAccounted(address(token)) == 2_980e18, "Fee accounting wrong");
        require(newVault.isFullyBacked(address(token)), "new Vault underbacked after fee");

        newEngine.updateFundingIndex(1, int256(1e24)); // long owes 2 units.
        require(newEngine.previewFundingPayment(NEW_USER, 1) == -int256(2e18), "funding preview wrong");
        vm.prank(NEW_USER);
        newEngine.settleFunding(1);
        require(newVault.fundingPoolBalance(address(token)) == 2e18, "Funding pool wrong");
        require(newVault.availableBalance(NEW_USER, address(token)) == 2_478e18, "Funding debit wrong");
        require(newVault.isFullyBacked(address(token)), "new Vault underbacked after funding");

        require(oldVault.totalAccounted(address(token)) == oldAccounted, "old accounted changed");
        require(oldVault.availableBalance(OLD_USER, address(token)) == oldAvailable, "old user rights changed");
        require(token.balanceOf(address(oldVault)) == oldCustody, "old custody changed");
        require(oldVault.engine() == address(oldEngine), "historical pointer changed");
    }

    function test_M15_LiquidationDoesNotConsumeHistoricalVault() public {
        uint256 oldAccounted = oldVault.totalAccounted(address(token));
        uint256 oldCustody = token.balanceOf(address(oldVault));
        _fund(NEW_USER, newVault, 3_000e18);
        vm.prank(NEW_USER);
        newEngine.openPosition(1, 500e18, 2_000e18, true);
        newFeed.setAnswer(40_000e8); // unfavorable 20% movement; isolated mock only.
        newEngine.liquidate(NEW_USER, 1);

        (,,,, bool open) = newEngine.positions(NEW_USER, 1);
        require(!open, "liquidated position still open");
        require(newEngine.openInterestUsd(1) == 0, "new Engine OI not cleared");
        require(newVault.lockedBalance(NEW_USER, address(token)) == 0, "new margin remains locked");
        require(newVault.isFullyBacked(address(token)), "new Vault underbacked after liquidation");
        require(oldVault.totalAccounted(address(token)) == oldAccounted, "old accounting changed");
        require(token.balanceOf(address(oldVault)) == oldCustody, "old funds touched");
        require(oldVault.availableBalance(OLD_USER, address(token)) == 5_000e18,
            "old user balance touched");
    }

    function test_M15_EmergencyHaltBlocksNewOpenWithoutTouchingLegacy() public {
        _fund(NEW_USER, newVault, 3_000e18);
        uint256 newAccounted = newVault.totalAccounted(address(token));
        newRegistry.setEmergencyMarketMode(1, Registry.MarketMode.HALTED);
        vm.expectRevert(Engine.MarketInactive.selector);
        vm.prank(NEW_USER);
        newEngine.openPosition(1, 500e18, 2_000e18, true);
        require(newVault.totalAccounted(address(token)) == newAccounted,
            "reverted trade changed new accounting");
        require(newVault.lockedBalance(NEW_USER, address(token)) == 0,
            "reverted trade locked collateral");
        require(oldRegistry.marketMode(1) == Registry.MarketMode.ACTIVE,
            "new market halt affected old Registry");
        require(oldVault.availableBalance(OLD_USER, address(token)) == 5_000e18,
            "new market halt affected legacy user");
    }

    function test_M15_StaleOracleBlocksTradeWithoutPartialBalanceMutation() public {
        _fund(NEW_USER, newVault, 3_000e18);
        newFeed.setUpdatedAt(START - 121);
        vm.expectRevert(Engine.StaleOraclePrice.selector);
        vm.prank(NEW_USER);
        newEngine.openPosition(1, 500e18, 2_000e18, true);
        require(newVault.availableBalance(NEW_USER, address(token)) == 3_000e18,
            "failed oracle trade changed user available");
        require(newVault.lockedBalance(NEW_USER, address(token)) == 0,
            "failed oracle trade locked collateral");
        require(oldVault.availableBalance(OLD_USER, address(token)) == 5_000e18,
            "stale new Oracle affected old assets");
    }

    function _assertNewConservation() internal view {
        uint256 tokenBalance = token.balanceOf(address(newVault));
        uint256 liability = newVault.totalAccounted(address(token))
            + newVault.fundingPoolBalance(address(token))
            + newVault.insuranceFeeReserve(address(token))
            + newVault.treasuryFeeReserve(address(token));
        require(tokenBalance >= liability, "M16 underbacked Vault");
        require(newVault.availableBalance(NEW_USER, address(token))
            + newVault.lockedBalance(NEW_USER, address(token))
            == newVault.totalAccounted(address(token)), "M16 user ledger mismatch");
        require(oldVault.availableBalance(OLD_USER, address(token)) == 5_000e18,
            "M16 legacy user rights mutated");
        require(oldVault.totalAccounted(address(token)) == 5_000e18,
            "M16 old accounted balance mutated");
        require(token.balanceOf(address(oldVault)) == 5_000e18,
            "M16 old custody mutated");
    }

    function test_M16_RepeatedPartialReductionsPreserveUserAndReserves() public {
        newEngine.configureTradingFee(1, 100, 6000); // mock research economics only
        _fund(NEW_USER, newVault, 3_000e18);
        vm.prank(NEW_USER);
        newEngine.openPosition(1, 500e18, 2_000e18, true);
        _assertNewConservation();

        uint256[4] memory reductions = [uint256(100e18), 300e18, 600e18, 1_000e18];
        uint256 outstanding = 2_000e18;
        for (uint256 i; i < reductions.length; i++) {
            vm.prank(NEW_USER);
            newEngine.reducePosition(1, reductions[i]);
            outstanding -= reductions[i];
            require(newEngine.openInterestUsd(1) == outstanding, "M16 OI mismatch");
            _assertNewConservation();
        }
        (,,,, bool open) = newEngine.positions(NEW_USER, 1);
        require(!open && outstanding == 0, "M16 reduction did not close");
        require(newVault.lockedBalance(NEW_USER, address(token)) == 0, "M16 stranded margin");
        require(newVault.insuranceFeeReserve(address(token)) == 24e18, "M16 Insurance incorrect");
        require(newVault.treasuryFeeReserve(address(token)) == 16e18, "M16 Treasury incorrect");
        require(newVault.totalAccounted(address(token)) == 2_960e18, "M16 accounting incorrect");
        _assertNewConservation();
    }

    function test_M16_RepeatFundingCheckpointPreservesCashAndFundingPool() public {
        newEngine.configureTradingFee(1, 100, 6000);
        newEngine.configureFunding(1, 1e25);
        _fund(NEW_USER, newVault, 3_000e18);
        vm.prank(NEW_USER);
        newEngine.openPosition(1, 500e18, 2_000e18, true);
        newEngine.updateFundingIndex(1, int256(1e24)); // long owes 2 tokens
        vm.prank(NEW_USER);
        newEngine.settleFunding(1);
        uint256 accounted = newVault.totalAccounted(address(token));
        uint256 funded = newVault.fundingPoolBalance(address(token));
        vm.prank(NEW_USER);
        newEngine.settleFunding(1); // no new index delta: no second debit
        require(newVault.totalAccounted(address(token)) == accounted, "M16 repeated funding debited");
        require(newVault.fundingPoolBalance(address(token)) == funded, "M16 repeated funding credited");
        vm.prank(NEW_USER);
        newEngine.reducePosition(1, 800e18); // at unchanged price and index
        require(newEngine.openInterestUsd(1) == 1_200e18, "M16 partial OI mismatch");
        _assertNewConservation();
        vm.prank(NEW_USER);
        newEngine.closePosition(1);
        require(newEngine.openInterestUsd(1) == 0, "M16 final OI mismatch");
        require(newVault.fundingPoolBalance(address(token)) == 2e18, "M16 funding not conserved");
        _assertNewConservation();
    }

    function test_M16_InsuranceCoverageDoesNotHideResidualDebt() public {
        newEngine.configureTradingFee(1, 100, 6000);
        newEngine.configureInsuranceCoverage(1, 5000); // cap at 50% of deficit
        _fund(NEW_USER, newVault, 3_000e18);
        vm.prank(NEW_USER);
        newEngine.openPosition(1, 500e18, 2_000e18, true);
        newFeed.setAnswer(25_000e8); // 50% adverse move, full liquidation
        newEngine.liquidate(NEW_USER, 1);
        (,,,,bool open) = newEngine.positions(NEW_USER, 1);
        require(!open && newEngine.openInterestUsd(1) == 0, "M16 position not cleared");
        require(newVault.insuranceFeeReserve(address(token)) == 0, "M16 Insurance not used");
        require(newVault.totalInsuranceCovered(address(token)) == 12e18, "M16 Insurance paid wrong");
        require(newVault.residualBadDebt(address(token)) == 488e18, "M16 residual debt hidden");
        require(newVault.treasuryFeeReserve(address(token)) == 8e18, "M16 Treasury misused");
        require(newVault.isFullyBacked(address(token)), "M16 assets underbacked");
        require(!newVault.isSolvent(address(token)), "M16 debt improperly treated as solvent");
        _assertNewConservation();
    }

    function test_M17_TinyReductionCannotReleaseZeroMargin() public {
        newEngine.configureTradingFee(1, 100, 6000);
        _fund(NEW_USER, newVault, 1_000e18);
        vm.prank(NEW_USER);
        newEngine.openPosition(1, 20, 100, true);
        uint256 accounted = newVault.totalAccounted(address(token));
        uint256 locked = newVault.lockedBalance(NEW_USER, address(token));
        uint256 insurance = newVault.insuranceFeeReserve(address(token));

        vm.expectRevert(Engine.InvalidReduction.selector);
        vm.prank(NEW_USER);
        newEngine.reducePosition(1, 1);
        require(newVault.totalAccounted(address(token)) == accounted, "M17 rejected reduction debited balance");
        require(newVault.lockedBalance(NEW_USER, address(token)) == locked, "M17 rejected reduction released collateral");
        require(newVault.insuranceFeeReserve(address(token)) == insurance, "M17 rejected reduction charged fee");
        require(newEngine.openInterestUsd(1) == 100, "M17 rejected reduction modified OI");
        _assertNewConservation();
    }

    function test_M17_DeterministicPartialLiquidationConservesAccounting() public {
        newEngine.configurePartialLiquidation(1, 5000, 0); // half of notional at each liquidation
        _fund(NEW_USER, newVault, 3_000e18);
        vm.prank(NEW_USER);
        newEngine.openPosition(1, 500e18, 2_000e18, true);
        newFeed.setAnswer(38_000e8);
        uint256 prior = newEngine.openInterestUsd(1);
        uint256 successfulLiquidations;
        for (uint256 i; i < 4; i++) {
            (uint256 margin, uint256 size,,,bool open) = newEngine.positions(NEW_USER, 1);
            if (!open) break;
            // At a fixed mock price of 38,000 from entry 50,000, equity = margin - 24% of size.
            // Liquidation is allowed only while equity <= 5% maintenance margin.
            int256 equity = int256(margin) - int256(size * 12 / 50);
            uint256 maintenance = size * 500 / 10_000;
            if (equity > int256(maintenance)) break;
            newEngine.liquidate(NEW_USER, 1);
            successfulLiquidations++;
            uint256 next = newEngine.openInterestUsd(1);
            require(next < prior, "M17 liquidation did not reduce OI");
            require(next <= size, "M17 liquidation increased notional");
            require(newVault.lockedBalance(NEW_USER, address(token)) <= margin,
                "M17 liquidation increased locked collateral");
            _assertNewConservation();
            prior = next;
        }
        require(successfulLiquidations > 0, "M17 partial-liquidation case not exercised");
        require(oldVault.availableBalance(OLD_USER, address(token)) == 5_000e18,
            "M17 legacy user balance modified");
    }

    function test_M17_FractionalFundingAccumulatesAndCannotDoubleDebit() public {
        newEngine.configureFunding(1, 1e20);
        _fund(NEW_USER, newVault, 1_000e18);
        vm.prank(NEW_USER);
        newEngine.openPosition(1, 1e18, 3e18, true);
        for (uint256 i; i < 4; i++) {
            newEngine.updateFundingIndex(1, int256(1e8));
            vm.prank(NEW_USER);
            newEngine.settleFunding(1);
            _assertNewConservation();
        }
        require(newVault.fundingPoolBalance(address(token)) == 1,
            "M17 fractional funding did not carry into full smallest unit");
        uint256 accounted = newVault.totalAccounted(address(token));
        vm.prank(NEW_USER);
        newEngine.settleFunding(1);
        require(newVault.totalAccounted(address(token)) == accounted,
            "M17 duplicate fractional funding debit");
        _assertNewConservation();
    }

    function test_M18_FeeSplitAccruesRatherThanEvadesCharge() public {
        newEngine.configureTradingFee(1, 100, 6000);
        _fund(NEW_USER, newVault, 1_000e18);
        vm.prank(NEW_USER);
        newEngine.openPosition(1, 20, 100, true);
        uint256 priorInsurance = newVault.insuranceFeeReserve(address(token));
        uint256 priorTreasury = newVault.treasuryFeeReserve(address(token));
        require(priorTreasury == 1 && priorInsurance == 0,
            "M17 precondition opening fee wrong");
        for (uint256 i; i < 20; i++) {
            vm.prank(NEW_USER);
            newEngine.reducePosition(1, 5);
            _assertNewConservation();
        }
        require(newEngine.openInterestUsd(1) == 0, "M17 tiny slices not closed");
        // The 20 reductions each create 0.05 base units of fee; their sum must charge 1.
        require(newVault.treasuryFeeReserve(address(token)) == priorTreasury &&
            newVault.insuranceFeeReserve(address(token)) == priorInsurance + 1,
            "M18 total fee/Insurance does not match cumulative 2 units at 60% share");
        require(newEngine.tradingFeeRemainderBps(NEW_USER, 1) == 0,
            "M18 fee fraction should be fully collected");
        require(newEngine.insuranceShareRemainderBps(NEW_USER, 1) == 2000,
            "M18 Insurance fraction not carried");
    }

    function test_M17_ZeroInsuranceCapPreservesExplicitResidualBadDebt() public {
        newEngine.configureTradingFee(1, 100, 6000);
        newEngine.configureInsuranceCoverage(1, 0);
        _fund(NEW_USER, newVault, 3_000e18);
        vm.prank(NEW_USER);
        newEngine.openPosition(1, 500e18, 2_000e18, true);
        newFeed.setAnswer(25_000e8);
        newEngine.liquidate(NEW_USER, 1);
        require(newVault.insuranceFeeReserve(address(token)) == 12e18,
            "M17 zero coverage incorrectly spent Insurance");
        require(newVault.residualBadDebt(address(token)) == 500e18,
            "M17 zero coverage hid residual debt");
        require(!newVault.isSolvent(address(token)), "M17 zero coverage erroneously solvent");
        _assertNewConservation();
    }

    function test_M18_SplitAndSingleCloseCollectIdenticalFeesAndInsurance() public {
        address other = address(0xC33);
        newEngine.configureTradingFee(1, 100, 6000);
        _fund(NEW_USER, newVault, 1_000);
        _fund(other, newVault, 1_000);

        vm.prank(NEW_USER);
        newEngine.openPosition(1, 20, 100, true);
        vm.prank(other);
        newEngine.openPosition(1, 20, 100, true);

        // New user splits the same 100 notional into twenty 5-unit pieces.
        for (uint256 i; i < 20; i++) {
            vm.prank(NEW_USER);
            newEngine.reducePosition(1, 5);
        }
        vm.prank(other);
        newEngine.reducePosition(1, 100);

        // Two opens + two equivalent closes => four fee units, 2 Insurance + 2 Treasury.
        require(newVault.totalAccounted(address(token)) == 1_996,
            "M18 split/single total fee not equal");
        require(newVault.insuranceFeeReserve(address(token)) == 2,
            "M18 Insurance split/single total mismatch");
        require(newVault.treasuryFeeReserve(address(token)) == 2,
            "M18 Treasury split/single total mismatch");
        require(newVault.availableBalance(NEW_USER, address(token)) == 998,
            "M18 split user over/under-charged");
        require(newVault.availableBalance(other, address(token)) == 998,
            "M18 unsplit user over/under-charged");
        require(newVault.lockedBalance(NEW_USER, address(token)) == 0 &&
            newVault.lockedBalance(other, address(token)) == 0,
            "M18 finished trades retain locked balances");
        require(newEngine.openInterestUsd(1) == 0, "M18 OI retained");
        require(newEngine.tradingFeeRemainderBps(NEW_USER, 1) == 0 &&
            newEngine.tradingFeeRemainderBps(other, 1) == 0,
            "M18 fee remainder should be exhausted");
        require(token.balanceOf(address(newVault)) ==
            newVault.totalAccounted(address(token)) +
            newVault.insuranceFeeReserve(address(token)) +
            newVault.treasuryFeeReserve(address(token)),
            "M18 Vault does not conserve user + reserve accounting");
        require(oldVault.availableBalance(OLD_USER, address(token)) == 5_000e18,
            "M18 historical user rights touched");
    }

    function test_M18_RevertedFeeChargeDoesNotAdvanceRemainder() public {
        newEngine.configureTradingFee(1, 100, 6000);
        _fund(NEW_USER, newVault, 1_000);
        vm.prank(NEW_USER);
        newEngine.openPosition(1, 20, 100, true);
        vm.prank(NEW_USER);
        newEngine.reducePosition(1, 5); // accrues 500 bps remainder
        uint256 beforeRemainder = newEngine.tradingFeeRemainderBps(NEW_USER, 1);
        uint256 beforeAccounted = newVault.totalAccounted(address(token));
        vm.expectRevert(Engine.InvalidReduction.selector);
        vm.prank(NEW_USER);
        newEngine.reducePosition(1, 0);
        require(newEngine.tradingFeeRemainderBps(NEW_USER, 1) == beforeRemainder,
            "M18 reverted operation mutated fee remainder");
        require(newVault.totalAccounted(address(token)) == beforeAccounted,
            "M18 reverted operation mutated custody accounting");
    }

    function test_M18_RemainderSurvivesPositionCloseAndNewOpen() public {
        newEngine.configureTradingFee(1, 100, 6000);
        _fund(NEW_USER, newVault, 1_000);
        vm.prank(NEW_USER);
        newEngine.openPosition(1, 20, 100, true);
        vm.prank(NEW_USER);
        newEngine.reducePosition(1, 100);
        // First 2 fees at 60% insurance => 1 insurance, 1 treasury, remainder 2000.
        require(newEngine.insuranceShareRemainderBps(NEW_USER, 1) == 2000,
            "M18 insurance remainder erased at close");
        vm.prank(NEW_USER);
        newEngine.openPosition(1, 20, 100, true);
        require(newEngine.insuranceShareRemainderBps(NEW_USER, 1) == 8000,
            "M18 insurance remainder did not persist after reopen");
        require(newVault.insuranceFeeReserve(address(token)) == 1 &&
            newVault.treasuryFeeReserve(address(token)) == 2,
            "M18 reopen fee accounting mismatch");
    }

    function test_M19_FeeRateChangePreservesPriorAccruedFraction() public {
        newEngine.configureTradingFee(1, 100, 6000); // 1% then zero
        _fund(NEW_USER, newVault, 1_000);
        vm.prank(NEW_USER);
        newEngine.openPosition(1, 20, 100, true); // opening fee 1 base unit
        vm.prank(NEW_USER);
        newEngine.reducePosition(1, 5); // 500 / 10000 accrued
        require(newEngine.tradingFeeRemainderBps(NEW_USER, 1) == 500,
            "M19 prior fee fraction not recorded");
        newEngine.configureTradingFee(1, 0, 6000);
        vm.prank(NEW_USER);
        newEngine.reducePosition(1, 5);
        require(newEngine.tradingFeeRemainderBps(NEW_USER, 1) == 500,
            "M19 changing fee rate erased prior credit");
        newEngine.configureTradingFee(1, 100, 6000);
        vm.prank(NEW_USER);
        newEngine.reducePosition(1, 90);
        require(newEngine.tradingFeeRemainderBps(NEW_USER, 1) == 9500,
            "M19 rounding remainder corrupted after rate change");
        // Policy unresolved: historical fractional obligation lives beyond a zero-fee interval.
        _assertNewConservation();
    }

    function test_M19_InsuranceShareChangeCarriesPastFractionAcrossPolicyEpoch() public {
        newEngine.configureTradingFee(1, 100, 6000);
        _fund(NEW_USER, newVault, 1_000);
        vm.prank(NEW_USER);
        newEngine.openPosition(1, 20, 100, true); // Insurance 0, remainder 6000
        require(newEngine.insuranceShareRemainderBps(NEW_USER, 1) == 6000,
            "M19 initial Insurance fraction not carried");
        newEngine.configureTradingFee(1, 100, 0);
        vm.prank(NEW_USER);
        newEngine.reducePosition(1, 100); // new Insurance share 0%, but 6000 remains
        require(newEngine.insuranceShareRemainderBps(NEW_USER, 1) == 6000,
            "M19 zero-share epoch silently burned prior fraction");
        require(newVault.insuranceFeeReserve(address(token)) == 0,
            "M19 zero-share unexpectedly paid Insurance");
        newEngine.configureTradingFee(1, 100, 6000);
        vm.prank(NEW_USER);
        newEngine.openPosition(1, 20, 100, true);
        require(newVault.insuranceFeeReserve(address(token)) == 1,
            "M19 cross-epoch Insurance cumulative distribution differs");
        require(newEngine.insuranceShareRemainderBps(NEW_USER, 1) == 2000,
            "M19 Insurance cross-epoch fraction incorrect");
        // This is recorded current behavior, not an approved governance policy.
        _assertNewConservation();
    }

    function test_M19_CurrentCandidateRequiresNotionalAndCollateralSameBaseUnit() public {
        // The live candidate uses the 18-decimal USD notional in leverage
        // directly against collateral base units; 6-decimal collateral is not yet supported.
        uint256 notional18 = 2_000e18; // 2,000 USD with 18-decimal notional
        uint256 margin6 = 500e6;       // 500 USD with 6-decimal collateral
        uint256 leverageLimitBps = 100_000; // 10x
        require(notional18 * 10_000 > margin6 * leverageLimitBps,
            "M19 scale mismatch precondition not reproduced");
        uint256 normalizedMargin18 = margin6 * 1e12;
        require(notional18 * 10_000 <= normalizedMargin18 * leverageLimitBps,
            "M19 normalized value should satisfy 10x leverage");
        uint256 wrongFee = notional18 * 100 / 10_000;
        uint256 correctFee6 = notional18 / 1e12 * 100 / 10_000;
        require(wrongFee == 20e18 && correctFee6 == 20e6,
            "M19 expected decimal-specific fee arithmetic not reproduced");
        require(wrongFee > margin6,
            "M19 6-decimal cash cannot pay naive 18-decimal fees");
    }

    function testFuzz_M22_EighteenDecimalFeeInsuranceReserveConservation(uint32 seedNotional,uint16 seedFee) public {
        uint256 usd=uint256(seedNotional)%2_400+1;
        uint256 bps=uint256(seedFee)%300+1;
        newEngine.configureTradingFee(1,bps,6000);
        _fund(NEW_USER,newVault,3_000e18);
        vm.prank(NEW_USER);
        newEngine.openPosition(1,500e18,usd*1e18,true);
        uint256 fee=(usd*1e18*bps)/10_000;
        require(newEngine.openInterestUsd(1)==usd*1e18,"M22 18-dec OI incorrect");
        require(newVault.availableBalance(NEW_USER,address(token))==2_500e18-fee,
            "M22 18-dec user fee incorrect");
        require(newVault.insuranceFeeReserve(address(token))==fee*6000/10_000,
            "M22 18-dec Insurance incorrect");
        _assertNewConservation();
    }

    function testFuzz_M22_EighteenDecimalRepeatedFundingCannotDoubleDebit(uint32 seedNotional) public {
        uint256 usd=uint256(seedNotional)%2_400+1;
        newEngine.configureFunding(1,1e25);
        _fund(NEW_USER,newVault,3_000e18);
        vm.prank(NEW_USER);
        newEngine.openPosition(1,500e18,usd*1e18,true);
        newEngine.updateFundingIndex(1,int256(1e24));
        vm.prank(NEW_USER);
        newEngine.settleFunding(1);
        uint256 accounted=newVault.totalAccounted(address(token));
        uint256 funded=newVault.fundingPoolBalance(address(token));
        vm.prank(NEW_USER);
        newEngine.settleFunding(1);
        require(newVault.totalAccounted(address(token))==accounted,
            "M22 18-dec Funding charged twice");
        require(newVault.fundingPoolBalance(address(token))==funded,
            "M22 18-dec Funding pool overcredited");
        _assertNewConservation();
    }
}
