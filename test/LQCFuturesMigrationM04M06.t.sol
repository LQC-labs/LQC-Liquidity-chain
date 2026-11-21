// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {LQCFuturesMarketRegistry as Registry} from "../dex/contracts/futures/LQCFuturesMarketRegistry.sol";
import {LQCAggregatorOracleAdapter as Aggregator} from "../dex/contracts/futures/LQCAggregatorOracleAdapter.sol";
import {LQCPerpEngine as Engine} from "../dex/contracts/futures/LQCPerpEngine.sol";
import {LQCFuturesVault as Vault} from "../dex/contracts/futures/LQCFuturesVault.sol";
import {MockPriceFeed as Feed} from "../dex/contracts/mocks/MockPriceFeed.sol";
import {MockERC20} from "../dex/contracts/mocks/MockERC20.sol";

interface MigrationReviewVm {
    function warp(uint256) external;
    function prank(address) external;
    function expectRevert(bytes4) external;
}

/// @notice Local M04-M06 risk-reproduction tests. No migration implementation.
contract LQCFuturesMigrationM04M06Test {
    MigrationReviewVm private constant vm =
        MigrationReviewVm(address(uint160(uint256(keccak256("hevm cheat code")))));

    uint256 private constant START = 2_000_000_000;
    address private constant INDEX = address(0xB7C);
    address private constant LONG = address(0xA11);
    address private constant SHORT = address(0xB22);

    Registry private registry;
    Vault private vault;
    Engine private original;
    Aggregator private oracle;
    Feed private primary;
    MockERC20 private token;
    uint256 private market;

    function setUp() public {
        vm.warp(START);
        registry = new Registry(address(this));
        vault = new Vault(address(this));
        original = new Engine(address(registry), address(vault));
        token = new MockERC20("Test USD", "tUSD");
        vault.setEngine(address(original));
        vault.setSupportedCollateral(address(token), true);

        oracle = new Aggregator(address(this));
        primary = new Feed(8, 50_000e8);
        oracle.setFeed(INDEX, address(primary), 300);
        market = registry.addMarket("BTC/tUSD", INDEX, address(token), address(oracle), 100_000, 500);
        (address feed, uint32 heartbeat, address referenceFeed, uint16 deviation) = oracle.feedConfigs(INDEX);
        bytes32 configHash = keccak256(abi.encode(INDEX, feed, heartbeat, referenceFeed, deviation));
        uint256 version = oracle.configVersion(INDEX);
        registry.approveAggregatorRecoveryOracle(market, address(oracle), address(oracle).codehash, configHash, version);
        registry.setMarketMode(market, Registry.MarketMode.REDUCE_ONLY);
        uint256 epoch = registry.recoveryApprovalEpoch(market);
        registry.approveRecoveryActivation(
            market, address(oracle), address(oracle).codehash, configHash, version, epoch, START + 60
        );
        registry.activateMarket(market, epoch);

        _open(LONG, true);
        _open(SHORT, false);
    }

    function _open(address user, bool isLong) private {
        token.mint(user, 5_000e18);
        vm.prank(user);
        token.approve(address(vault), 5_000e18);
        vm.prank(user);
        vault.deposit(address(token), 5_000e18);
        vm.prank(user);
        original.openPosition(market, 1_000e18, 5_000e18, isLong);
    }

    function _position(Engine engine, address user) private view returns (bytes32) {
        (uint256 margin, uint256 size, uint256 price, bool isLong, bool opened) = engine.positions(user, market);
        return keccak256(abi.encode(margin, size, price, isLong, opened,
            engine.positionFundingEntryRay(user, market)));
    }

    function _vaultTotals() private view returns (bytes32) {
        address collateral = address(token);
        return keccak256(abi.encode(
            token.balanceOf(address(vault)),
            vault.totalAccounted(collateral),
            vault.availableBalance(LONG, collateral),
            vault.lockedBalance(LONG, collateral),
            vault.availableBalance(SHORT, collateral),
            vault.lockedBalance(SHORT, collateral),
            vault.fundingPoolBalance(collateral),
            vault.insuranceFeeReserve(collateral),
            vault.treasuryFeeReserve(collateral),
            vault.residualBadDebt(collateral),
            vault.totalInsuranceCovered(collateral)
        ));
    }

    function test_M04_PartialLiquidationLedgerPersistsButDoesNotTransfer() public {
        original.configurePartialLiquidation(market, 2500, 0);
        primary.setAnswer(42_500e8);
        vm.prank(address(0xC0DE));
        original.liquidate(LONG, market);

        (uint256 margin, uint256 size, uint256 entry,, bool opened) = original.positions(LONG, market);
        require(opened && size == 3_750e18 && margin == 812_500000000000000000 &&
            entry == 50_000e18, "partial-liquidation fixture invalid");
        require(vault.lockedBalance(LONG, address(token)) == margin, "margin/locked mismatch");

        bytes32 beforePosition = _position(original, LONG);
        bytes32 beforeVault = _vaultTotals();
        uint256 beforeOI = original.openInterestUsd(market);
        require(beforeOI == 8_750e18, "OI fixture invalid");

        Engine replacement = new Engine(address(registry), address(vault));
        vault.setEngine(address(replacement));

        require(_position(original, LONG) == beforePosition, "old partial position altered");
        require(_vaultTotals() == beforeVault, "Vault ledger altered");
        require(original.openInterestUsd(market) == beforeOI, "old OI altered");
        require(replacement.openInterestUsd(market) == 0, "OI improperly imported");
        (,,,, bool imported) = replacement.positions(LONG, market);
        require(!imported, "position improperly imported");

        vm.expectRevert(Vault.Forbidden.selector);
        vm.prank(LONG);
        original.closePosition(market);
        require(_position(original, LONG) == beforePosition, "failed close mutated old position");
        require(_vaultTotals() == beforeVault, "failed close mutated Vault");
    }

    function test_M05_InsuranceTreasuryDebtLedgersSurviveEngineSwitch() public {
        address collateral = address(token);
        vm.prank(address(original));
        vault.collectTradingFee(LONG, collateral, 600e18, 300e18);
        original.configureInsuranceCoverage(market, 5000);
        primary.setAnswer(35_000e8);
        vm.prank(LONG);
        original.closePosition(market);

        require(vault.insuranceFeeReserve(collateral) == 50e18, "insurance fixture invalid");
        require(vault.treasuryFeeReserve(collateral) == 300e18, "treasury fixture invalid");
        require(vault.totalInsuranceCovered(collateral) == 250e18, "coverage fixture invalid");
        require(vault.residualBadDebt(collateral) == 250e18, "debt fixture invalid");
        require(vault.isFullyBacked(collateral) && !vault.isSolvent(collateral), "solvency fixture invalid");

        bytes32 beforeVault = _vaultTotals();
        bytes32 shortBefore = _position(original, SHORT);
        uint256 beforeOI = original.openInterestUsd(market);

        Engine replacement = new Engine(address(registry), address(vault));
        vault.setEngine(address(replacement));

        require(_vaultTotals() == beforeVault, "insurance/debt/treasury altered");
        require(_position(original, SHORT) == shortBefore, "remaining position altered");
        require(original.openInterestUsd(market) == beforeOI, "old OI altered");
        require(replacement.openInterestUsd(market) == 0, "new OI unexpectedly populated");
        require(!vault.isSolvent(collateral), "bad debt silently cleared");
    }

    function test_M06_RevertingEnginePointerRestoresAccessNotMigration() public {
        bytes32 longBefore = _position(original, LONG);
        bytes32 vaultBefore = _vaultTotals();
        uint256 oi = original.openInterestUsd(market);
        Engine replacement = new Engine(address(registry), address(vault));

        vault.setEngine(address(replacement));
        vm.expectRevert(Vault.Forbidden.selector);
        vm.prank(LONG);
        original.closePosition(market);
        require(_position(original, LONG) == longBefore &&
            _vaultTotals() == vaultBefore, "failed settlement mutated state");

        vault.setEngine(address(original));
        require(vault.engine() == address(original), "engine pointer not restored");
        require(_position(original, LONG) == longBefore, "old position not retained");
        require(original.openInterestUsd(market) == oi, "old OI not retained");
        require(_vaultTotals() == vaultBefore, "Vault accounting changed on pointer recovery");

        vm.prank(LONG);
        original.closePosition(market);
        (,,,, bool openAfter) = original.positions(LONG, market);
        require(!openAfter && original.openInterestUsd(market) == oi - 5_000e18,
            "restored Engine cannot settle original position");
        require(vault.lockedBalance(LONG, address(token)) == 0, "margin not unlocked");
        require(vault.availableBalance(LONG, address(token)) == 5_000e18, "collateral not returned");
        (,,,, bool newOpen) = replacement.positions(LONG, market);
        require(!newOpen, "replacement unexpectedly acquired position");
    }
}
