// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {LQCFuturesMarketRegistry as Registry} from "../dex/contracts/futures/LQCFuturesMarketRegistry.sol";
import {LQCAggregatorOracleAdapter as Aggregator} from "../dex/contracts/futures/LQCAggregatorOracleAdapter.sol";
import {LQCPerpEngine as Engine} from "../dex/contracts/futures/LQCPerpEngine.sol";
import {LQCFuturesVault as Vault} from "../dex/contracts/futures/LQCFuturesVault.sol";
import {MockPriceFeed as Feed} from "../dex/contracts/mocks/MockPriceFeed.sol";
import {MockERC20} from "../dex/contracts/mocks/MockERC20.sol";

interface MigrationVm {
    function warp(uint256 timestamp) external;
    function prank(address caller) external;
    function expectRevert(bytes4 selector) external;
}

/// @notice Isolated, test-only demonstration of Engine switching without state migration.
/// @dev NOT a migration implementation, approval, or live deployment.
contract LQCFuturesMigrationM02M03Test {
    MigrationVm private constant vm = MigrationVm(address(uint160(uint256(keccak256("hevm cheat code")))));
    uint256 private constant START = 2_000_000_000;
    address private constant INDEX = address(0xB7C);
    address private constant LONG_TRADER = address(0xA11);
    address private constant SHORT_TRADER = address(0xB22);

    Registry private registry;
    Vault private vault;
    Engine private original;
    Aggregator private oracle;
    MockERC20 private collateral;
    uint256 private market;

    function setUp() public {
        vm.warp(START);
        registry = new Registry(address(this));
        vault = new Vault(address(this));
        original = new Engine(address(registry), address(vault));
        collateral = new MockERC20("Test USD", "tUSD");
        vault.setEngine(address(original));
        vault.setSupportedCollateral(address(collateral), true);

        oracle = new Aggregator(address(this));
        Feed primary = new Feed(8, 50_000e8);
        oracle.setFeed(INDEX, address(primary), 300);
        market = registry.addMarket("BTC/tUSD", INDEX, address(collateral), address(oracle), 100_000, 500);
        (address feed, uint32 heartbeat, address refFeed, uint16 deviation) = oracle.feedConfigs(INDEX);
        bytes32 configHash = keccak256(abi.encode(INDEX, feed, heartbeat, refFeed, deviation));
        registry.approveAggregatorRecoveryOracle(
            market, address(oracle), address(oracle).codehash, configHash, oracle.configVersion(INDEX)
        );
        registry.setMarketMode(market, Registry.MarketMode.REDUCE_ONLY);
        uint256 epoch = registry.recoveryApprovalEpoch(market);
        registry.approveRecoveryActivation(
            market, address(oracle), address(oracle).codehash, configHash,
            oracle.configVersion(INDEX), epoch, START + 60
        );
        registry.activateMarket(market, epoch);

        _open(LONG_TRADER, true);
        _open(SHORT_TRADER, false);
    }

    function _open(address account, bool isLong) private {
        collateral.mint(account, 5_000e18);
        vm.prank(account);
        collateral.approve(address(vault), 5_000e18);
        vm.prank(account);
        vault.deposit(address(collateral), 5_000e18);
        vm.prank(account);
        original.openPosition(market, 1_000e18, 5_000e18, isLong);
    }

    function _ledgerDigest(Engine e, address account) private view returns (bytes32) {
        (int256 net, int256 remainder, uint256 credit, uint256 debt) = e.fundingLedgers(account, market);
        return keccak256(abi.encode(net, remainder, credit, debt));
    }

    function _positionDigest(Engine e, address account) private view returns (bytes32) {
        (uint256 margin, uint256 size, uint256 entry, bool isLong, bool opened) = e.positions(account, market);
        return keccak256(abi.encode(margin, size, entry, isLong, opened,
            e.positionFundingEntryRay(account, market), _ledgerDigest(e, account)));
    }

    function test_M02_EngineSwitchDoesNotMigrateOpenLongShort() public {
        bytes32 longBefore = _positionDigest(original, LONG_TRADER);
        bytes32 shortBefore = _positionDigest(original, SHORT_TRADER);
        uint256 oi = original.openInterestUsd(market);
        uint256 oldLocked = vault.lockedBalance(LONG_TRADER, address(collateral));
        uint256 accounted = vault.totalAccounted(address(collateral));
        require(oi == 10_000e18 && oldLocked == 1_000e18, "bad fixture");

        Engine replacement = new Engine(address(registry), address(vault));
        vault.setEngine(address(replacement));

        require(_positionDigest(original, LONG_TRADER) == longBefore, "old long altered");
        require(_positionDigest(original, SHORT_TRADER) == shortBefore, "old short altered");
        require(original.openInterestUsd(market) == oi, "old OI changed");
        require(replacement.openInterestUsd(market) == 0, "new OI unexpectedly imported");
        (,,,, bool longOpened) = replacement.positions(LONG_TRADER, market);
        (,,,, bool shortOpened) = replacement.positions(SHORT_TRADER, market);
        require(!longOpened && !shortOpened, "new Engine unexpectedly imported positions");
        require(vault.lockedBalance(LONG_TRADER, address(collateral)) == oldLocked, "vault lock changed");
        require(vault.totalAccounted(address(collateral)) == accounted, "vault accounting changed");

        vm.expectRevert(Vault.Forbidden.selector);
        vm.prank(LONG_TRADER);
        original.closePosition(market);
        require(_positionDigest(original, LONG_TRADER) == longBefore, "failed close altered old position");
    }

    function test_M03_EngineSwitchDoesNotMigratePendingFunding() public {
        original.configureFunding(market, 1e25);
        original.updateFundingIndex(market, 1e25);
        int256 longDue = original.previewFundingPayment(LONG_TRADER, market);
        int256 shortDue = original.previewFundingPayment(SHORT_TRADER, market);
        require(longDue < 0 && shortDue > 0, "no opposite funding obligations");

        uint256 pool = vault.fundingPoolBalance(address(collateral));
        uint256 accounted = vault.totalAccounted(address(collateral));
        Engine replacement = new Engine(address(registry), address(vault));
        vault.setEngine(address(replacement));

        (int256 newCumulative,, bool configured) = replacement.fundingStates(market);
        require(!configured && newCumulative == 0, "new funding state imported unexpectedly");
        require(original.previewFundingPayment(LONG_TRADER, market) == longDue, "old long funding changed");
        require(original.previewFundingPayment(SHORT_TRADER, market) == shortDue, "old short funding changed");
        require(vault.fundingPoolBalance(address(collateral)) == pool &&
            vault.totalAccounted(address(collateral)) == accounted, "vault funding accounting changed");

        vm.expectRevert(Engine.PositionNotFound.selector);
        vm.prank(LONG_TRADER);
        replacement.settleFunding(market);

        vm.expectRevert(Vault.Forbidden.selector);
        vm.prank(LONG_TRADER);
        original.settleFunding(market);
        require(original.previewFundingPayment(LONG_TRADER, market) == longDue, "failed settlement altered debt");
    }
}
