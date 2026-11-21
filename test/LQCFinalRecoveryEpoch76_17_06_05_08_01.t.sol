// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {LQCFuturesMarketRegistry as Registry} from "../dex/contracts/futures/LQCFuturesMarketRegistry.sol";
import {LQCAggregatorOracleAdapter as Aggregator} from "../dex/contracts/futures/LQCAggregatorOracleAdapter.sol";
import {LQCPerpEngine as Engine} from "../dex/contracts/futures/LQCPerpEngine.sol";
import {LQCFuturesVault as Vault} from "../dex/contracts/futures/LQCFuturesVault.sol";
import {MockPriceFeed as Feed} from "../dex/contracts/mocks/MockPriceFeed.sol";
import {MockERC20} from "../dex/contracts/mocks/MockERC20.sol";

interface ReviewVm {
    function warp(uint256 time) external;
    function prank(address caller) external;
    function expectRevert(bytes4 errorSelector) external;
}

contract LQCFinalRecoveryEpoch761706050801Test {
    ReviewVm private constant vm = ReviewVm(address(uint160(uint256(keccak256("hevm cheat code")))));
    address private constant TOKEN = address(0x101);
    address private constant TRADER = address(0xA11);
    address private constant GUARDIAN = address(0x6A4D);
    uint256 private constant START = 2_000_000_000;
    uint16 private constant DEVIATION = 200;
    uint32 private constant HEARTBEAT = 300;

    Registry private registry;
    Vault private vault;
    Engine private engine;
    MockERC20 private collateral;
    uint256 private market;

    function setUp() public {
        vm.warp(START);
        registry = new Registry(address(this));
        registry.setGuardian(GUARDIAN);
        collateral = new MockERC20("Test USD", "tUSD");
        vault = new Vault(address(this));
        engine = new Engine(address(registry), address(vault));
        vault.setEngine(address(engine));
        vault.setSupportedCollateral(address(collateral), true);
    }

    function _adapter(uint256 referenceAge, bool useReference)
        private returns (Aggregator oracle, Feed primary, Feed referenceFeed, bytes32 config)
    {
        oracle = new Aggregator(address(this));
        primary = new Feed(8, 50_000e8);
        referenceFeed = new Feed(8, 50_000e8);
        referenceFeed.setUpdatedAt(START - referenceAge);
        oracle.setFeed(TOKEN, address(primary), HEARTBEAT);
        address refAddress = useReference ? address(referenceFeed) : address(0);
        uint16 deviation = useReference ? DEVIATION : 0;
        if (useReference) oracle.setCircuitBreaker(TOKEN, refAddress, deviation);
        config = keccak256(abi.encode(TOKEN, address(primary), HEARTBEAT, refAddress, deviation));
    }

    function _register(Aggregator oracle) private {
        market = registry.addMarket("BTC/tUSD", TOKEN, address(collateral), address(oracle), 100_000, 500);
    }

    function _nominate(Aggregator oracle, bytes32 config) private {
        registry.approveAggregatorRecoveryOracle(market, address(oracle), address(oracle).codehash, config, oracle.configVersion(TOKEN));
    }

    function _approve(Aggregator oracle, bytes32 config) private returns (uint256 epoch) {
        _nominate(oracle, config);
        registry.setMarketMode(market, Registry.MarketMode.REDUCE_ONLY);
        epoch = registry.recoveryApprovalEpoch(market);
        registry.approveRecoveryActivation(market, address(oracle), address(oracle).codehash, config, oracle.configVersion(TOKEN),
            epoch, START + 60);
    }

    function _open() private {
        collateral.mint(TRADER, 5_000e18);
        vm.prank(TRADER);
        collateral.approve(address(vault), 5_000e18);
        vm.prank(TRADER);
        vault.deposit(address(collateral), 5_000e18);
        vm.prank(TRADER);
        engine.openPosition(market, 1_000e18, 5_000e18, true);
        engine.configureFunding(market, 1e25);
        engine.updateFundingIndex(market, 1e25);
    }

    function _accounting() private view returns (bytes32) {
        address token = address(collateral);
        (uint256 margin, uint256 size, uint256 entry, bool long, bool open) = engine.positions(TRADER, market);
        bytes32 position = keccak256(abi.encode(margin, size, entry, long, open, engine.openInterestUsd(market),
            engine.positionFundingEntryRay(TRADER, market), engine.previewFundingPayment(TRADER, market)));
        return keccak256(abi.encode(
            position, collateral.balanceOf(address(vault)), collateral.balanceOf(TRADER), vault.totalAccounted(token),
            vault.availableBalance(TRADER, token), vault.lockedBalance(TRADER, token), vault.fundingPoolBalance(token),
            vault.insuranceFeeReserve(token), vault.treasuryFeeReserve(token), vault.residualBadDebt(token)
        ));
    }

    function test_DelayedEpochCannotConsumeDifferentOracleApprovalOrChangeAccounting() public {
        (Aggregator a,,, bytes32 configA) = _adapter(0, true);
        _register(a);
        uint256 firstEpoch = _approve(a, configA);
        registry.activateMarket(market, firstEpoch);
        _open();
        // Prepare a second A recovery and retain its final activation calldata without submitting it.
        vm.prank(GUARDIAN);
        registry.setEmergencyMarketMode(market, Registry.MarketMode.HALTED);
        uint256 epochA = _approve(a, configA);
        bytes memory oldActivation = abi.encodeCall(registry.activateMarket, (market, epochA));

        vm.prank(GUARDIAN);
        registry.setEmergencyMarketMode(market, Registry.MarketMode.HALTED);
        (Aggregator b,,, bytes32 configB) = _adapter(0, true);
        registry.setOracle(market, address(b));
        uint256 epochB = _approve(b, configB);
        require(epochA != epochB && registry.recoveryOracle(market) == address(b), "not a different recovery");
        bytes32 accounting = _accounting();
        uint256 deadline = registry.recoveryActivationValidUntil(market);
        (bool ok, bytes memory reason) = address(registry).call(oldActivation);
        require(!ok && bytes4(reason) == Registry.RecoveryApprovalMismatch.selector, "old epoch not rejected");

        vm.expectRevert(Registry.Forbidden.selector);
        registry.setMarketMode(market, Registry.MarketMode.ACTIVE);
        vm.expectRevert(Registry.Forbidden.selector);
        registry.setMarketActive(market, true);
        vm.expectRevert(Registry.Forbidden.selector);
        registry.setEmergencyMarketMode(market, Registry.MarketMode.ACTIVE);
        vm.expectRevert(Registry.Forbidden.selector);
        vm.prank(GUARDIAN);
        registry.activateMarket(market, epochB);

        require(registry.recoveryApproved(market) && registry.recoveryActivationValidUntil(market) == deadline &&
            registry.recoveryApprovalEpoch(market) == epochB && registry.marketMode(market) == Registry.MarketMode.REDUCE_ONLY,
            "failed calls consumed B approval");
        require(_accounting() == accounting, "failed calls changed accounting");

        registry.activateMarket(market, epochB);
        require(registry.marketMode(market) == Registry.MarketMode.ACTIVE && !registry.recoveryApproved(market) &&
            registry.recoveryActivationValidUntil(market) == 0, "successful activation did not consume approval");
        require(_accounting() == accounting, "activation changed accounting");
    }

    function test_Reference240SecondsOldFailsNominationDespiteHeartbeat300() public {
        (Aggregator oracle, Feed primary, Feed referenceFeed, bytes32 config) = _adapter(240, true);
        _register(oracle);
        vm.expectRevert(Aggregator.StaleFeedPrice.selector);
        oracle.getPrice(TOKEN);
        uint256 version = oracle.configVersion(TOKEN);
        bytes32 codehash = address(oracle).codehash;
        vm.expectRevert(Registry.InvalidRecoveryPrice.selector);
        registry.approveAggregatorRecoveryOracle(market, address(oracle), codehash, config, version);
        require(registry.marketMode(market) == Registry.MarketMode.HALTED && registry.recoveryOracle(market) == address(0),
            "stale reference recorded approval");

        primary.setUpdatedAt(START);
        referenceFeed.setUpdatedAt(START - 120);
        uint256 epoch = _approve(oracle, config);
        registry.activateMarket(market, epoch);
        require(registry.marketMode(market) == Registry.MarketMode.ACTIVE, "both fresh feeds rejected");
    }

    function test_SingleFeedAndDeviationAndVersionChecksRemainEnforced() public {
        (Aggregator oracle, Feed primary, Feed referenceFeed, bytes32 config) = _adapter(240, false);
        _register(oracle);
        primary.setUpdatedAt(START - 121);
        uint256 version = oracle.configVersion(TOKEN);
        bytes32 codehash = address(oracle).codehash;
        vm.expectRevert(Registry.InvalidRecoveryPrice.selector);
        registry.approveAggregatorRecoveryOracle(market, address(oracle), codehash, config, version);
        primary.setUpdatedAt(START);
        uint256 epoch = _approve(oracle, config);

        referenceFeed.setUpdatedAt(START);
        referenceFeed.setAnswer(40_000e8);
        oracle.setCircuitBreaker(TOKEN, address(referenceFeed), DEVIATION);
        vm.expectRevert(Aggregator.ExcessivePriceDeviation.selector);
        oracle.getPrice(TOKEN);
        oracle.clearCircuitBreaker(TOKEN);
        require(oracle.configVersion(TOKEN) == version + 2, "version reused after restoration");
        vm.expectRevert(Registry.UnapprovedRecoveryOracle.selector);
        registry.activateMarket(market, epoch);
        require(registry.marketMode(market) == Registry.MarketMode.REDUCE_ONLY, "restored approval was used");
    }
}
