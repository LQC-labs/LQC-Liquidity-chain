// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

// M09: test-only parallel Futures stacks. No historical on-chain deployment or asset migration.
import {LQCFuturesMarketRegistry as Registry} from "../dex/contracts/futures/LQCFuturesMarketRegistry.sol";
import {LQCAggregatorOracleAdapter as Aggregator} from "../dex/contracts/futures/LQCAggregatorOracleAdapter.sol";
import {LQCPerpEngine as Engine} from "../dex/contracts/futures/LQCPerpEngine.sol";
import {LQCFuturesVault as Vault} from "../dex/contracts/futures/LQCFuturesVault.sol";
import {MockPriceFeed as Feed} from "../dex/contracts/mocks/MockPriceFeed.sol";
import {MockERC20} from "../dex/contracts/mocks/MockERC20.sol";

interface M09Vm {
    function warp(uint256 timestamp) external;
    function prank(address sender) external;
    function expectRevert(bytes4 selector) external;
}

contract LQCFuturesM15CoreIntegrationTest {
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
}
