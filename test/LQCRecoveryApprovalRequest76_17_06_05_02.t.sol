// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {LQCFuturesMarketRegistry as Registry} from "../dex/contracts/futures/LQCFuturesMarketRegistry.sol";
import {LQCAggregatorOracleAdapter as Aggregator} from "../dex/contracts/futures/LQCAggregatorOracleAdapter.sol";
import {MockPriceFeed} from "../dex/contracts/mocks/MockPriceFeed.sol";

interface Vm7617060502 {
    function warp(uint256 timestamp) external;
    function expectRevert(bytes4 selector) external;
}

contract LQCRecoveryApprovalRequest7617060502Test {
    Vm7617060502 private constant vm = Vm7617060502(address(uint160(uint256(keccak256("hevm cheat code")))));
    uint256 private constant START = 2_000_000_000;
    address private constant INDEX = address(0xB7C);

    struct Request {
        address oracle;
        bytes32 codehash;
        bytes32 configHash;
        uint256 version;
        uint256 epoch;
        uint256 validUntil;
    }

    Registry private registry;
    Aggregator private oracle;
    MockPriceFeed private primary;
    MockPriceFeed private referenceFeed;
    uint256 private market;

    function setUp() public {
        vm.warp(START);
        registry = new Registry(address(this));
        oracle = new Aggregator(address(this));
        primary = new MockPriceFeed(8, 50_000e8);
        referenceFeed = new MockPriceFeed(8, 50_000e8);
        _configure(oracle);
        market = registry.addMarket("BTC/tUSD", INDEX, address(0xC011), address(oracle), 100_000, 500);
        _nominateAndRestrict(oracle);
    }

    function _configure(Aggregator adapter) private {
        adapter.setFeed(INDEX, address(primary), 300);
        adapter.setCircuitBreaker(INDEX, address(referenceFeed), 200);
    }

    function _nominateAndRestrict(Aggregator adapter) private {
        (address feed, uint32 heartbeat, address refFeed, uint16 deviation) = adapter.feedConfigs(INDEX);
        bytes32 config = keccak256(abi.encode(INDEX, feed, heartbeat, refFeed, deviation));
        registry.approveAggregatorRecoveryOracle(market, address(adapter), address(adapter).codehash, config,
            adapter.configVersion(INDEX));
        registry.setMarketMode(market, Registry.MarketMode.REDUCE_ONLY);
    }

    function _request(uint256 validUntil) private view returns (Request memory) {
        return Request(registry.recoveryOracle(market), registry.recoveryOracleCodehash(market),
            registry.recoveryOracleConfigHash(market), registry.recoveryOracleConfigVersion(market),
            registry.recoveryApprovalEpoch(market), validUntil);
    }

    function _submit(Request memory r) private {
        registry.approveRecoveryActivation(market, r.oracle, r.codehash, r.configHash, r.version, r.epoch, r.validUntil);
    }

    function _assertNoApproval(uint256 epoch) private view {
        require(!registry.recoveryApproved(market) && registry.recoveryActivationValidUntil(market) == 0, "approval recorded");
        require(registry.marketMode(market) == Registry.MarketMode.REDUCE_ONLY &&
            registry.recoveryApprovalEpoch(market) == epoch, "market state changed");
    }

    function _assertCanActivate(Request memory r) private {
        _submit(r);
        require(registry.recoveryApproved(market) && registry.recoveryActivationValidUntil(market) == r.validUntil,
            "bound approval not recorded");
        registry.setMarketActive(market, true);
        require(registry.marketMode(market) == Registry.MarketMode.ACTIVE && !registry.recoveryApproved(market),
            "activation failed to consume approval");
    }

    function test_RejectsUnboundLegacyApprovalAndEveryMismatchedRequestField() public {
        Request memory r = _request(START + 60);
        vm.expectRevert(Registry.RecoveryApprovalMismatch.selector);
        registry.setRecoveryApproved(market, true);
        for (uint256 i; i < 5; ++i) {
            Request memory invalid = _request(r.validUntil);
            if (i == 0) invalid.oracle = address(0x1111);
            else if (i == 1) invalid.codehash = bytes32(uint256(1));
            else if (i == 2) invalid.configHash = bytes32(uint256(1));
            else if (i == 3) invalid.version += 1;
            else invalid.epoch += 1;
            vm.expectRevert(Registry.RecoveryApprovalMismatch.selector);
            _submit(invalid);
        }
        _assertNoApproval(r.epoch);
        _assertCanActivate(r);
    }

    function test_PreparedApprovalCannotCarryOverToReplacementOracle() public {
        Request memory old = _request(START + 60);
        registry.setMarketActive(market, false);
        Aggregator replacement = new Aggregator(address(this));
        _configure(replacement);
        registry.setOracle(market, address(replacement));
        _nominateAndRestrict(replacement);
        Request memory current = _request(START + 60);
        require(old.codehash == current.codehash && old.configHash == current.configHash && old.version == current.version,
            "replacement must preserve code, config and version");
        vm.expectRevert(Registry.RecoveryApprovalMismatch.selector);
        _submit(old);
        _assertNoApproval(current.epoch);
        _assertCanActivate(current);
    }

    function test_ConfigDriftAndRestorationRejectPreparedApprovalBothBeforeAndAfterNomination() public {
        Request memory old = _request(START + 60);
        oracle.setCircuitBreaker(INDEX, address(referenceFeed), 201);
        vm.expectRevert(Registry.UnapprovedRecoveryOracle.selector);
        _submit(old);
        oracle.setCircuitBreaker(INDEX, address(referenceFeed), 200);
        vm.expectRevert(Registry.UnapprovedRecoveryOracle.selector);
        _submit(old);
        _assertNoApproval(old.epoch);
        registry.setMarketActive(market, false);
        _nominateAndRestrict(oracle);
        Request memory current = _request(START + 60);
        require(current.configHash == old.configHash && current.version > old.version, "wrong ABA setup");
        vm.expectRevert(Registry.RecoveryApprovalMismatch.selector);
        _submit(old);
        _assertNoApproval(current.epoch);
        _assertCanActivate(current);
    }

    function test_ExpiredRequestAndExpiredRecordedApprovalStayExpiredAfterPriceRefresh() public {
        Request memory tooLong = _request(START + 121);
        vm.expectRevert(Registry.InvalidRecoveryPrice.selector);
        _submit(tooLong);
        Request memory old = _request(START + 5);
        _submit(old);
        vm.warp(START + 6);
        primary.setUpdatedAt(START + 6);
        referenceFeed.setUpdatedAt(START + 6);
        require(!registry.recoveryApproved(market), "expired approval revived");
        vm.expectRevert(Registry.RecoveryApprovalExpired.selector);
        _submit(old);
        vm.expectRevert(Registry.RecoveryApprovalExpired.selector);
        registry.setMarketActive(market, true);
        require(registry.recoveryActivationValidUntil(market) == old.validUntil &&
            registry.marketMode(market) == Registry.MarketMode.REDUCE_ONLY, "expiry rejection changed state");
        _assertCanActivate(_request(START + 60));
    }

    function test_SameOracleRenominationAndRevocationInvalidatePreparedEpoch() public {
        Request memory old = _request(START + 60);
        registry.setMarketActive(market, false);
        _nominateAndRestrict(oracle);
        Request memory current = _request(START + 60);
        require(current.version == old.version && current.configHash == old.configHash && current.epoch > old.epoch,
            "same configuration must receive a fresh epoch");
        vm.expectRevert(Registry.RecoveryApprovalMismatch.selector);
        _submit(old);
        registry.setRecoveryApproved(market, false);
        vm.expectRevert(Registry.RecoveryApprovalMismatch.selector);
        _submit(current);
        Request memory renewed = _request(START + 60);
        _assertNoApproval(renewed.epoch);
        _assertCanActivate(renewed);
    }
}
