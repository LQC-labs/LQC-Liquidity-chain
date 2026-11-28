// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

interface IEmergencyDex {
    function pauseAdmin() external view returns (address);
    function pauseSwaps() external;
    function recoveryConfigHash() external view returns (bytes32);
}

interface IEmergencyFutures {
    function guardian() external view returns (address);
    function recoveryApprovalEpoch(uint256 marketId) external view returns (uint256);
    function recoveryOracleConfigHash(uint256 marketId) external view returns (bytes32);
    function markets(uint256 marketId) external view returns (bytes32,address,address,address,uint32,uint32,bool);
    function applyEmergencyTriggers(uint256 marketId, bool oracleHealthy, bool circuitBreakerAllowed, bool hasResidualBadDebt) external;
}

interface IEmergencyLending {
    function guardian() external view returns (address);
    function recoveryConfigHash(bytes32 marketId) external view returns (bytes32);
    function setMarketEnabled(bytes32 marketId, bool enabled) external;
}

interface IEmergencyPayout {
    function guardian() external view returns (address);
    function epoch() external view returns (uint256);
    function policyVersion() external view returns (uint256);
    function setHold(bool held) external;
    function held() external view returns (bool);
    function vault() external view returns (address);
    function risk() external view returns (address);
    function recoveryNonce() external view returns (uint256);
    function recoverHold(uint256 policy, uint256 epoch, uint256 nonce) external;
}

interface IEmergencyLaunch {
    function guardian() external view returns (address);
    function emergencyEpoch() external view returns (uint256);
    function pauseLaunch() external;
}

interface IEmergencyIntent {
    function guardian() external view returns (address);
    function setPaused(bool value) external;
    function router() external view returns (address);
    function quoteBook() external view returns (address);
    function settlementVerifier() external view returns (address);
    function executionEpoch() external view returns (bytes32);
    function executionPaused() external view returns (bool);
}

interface IRiskBinding { function riskRegistry() external view returns (address); }
interface IHubBinding { function hub() external view returns (address); }

/// @notice Aggregates the existing restriction-only roles. Recovery stays at each service's native authority.
contract LQCServiceEmergencyRelay {
    enum Scope { DEX, FUTURES, LENDING, CREATOR, CONNECTED_SERVICES, LAUNCHPAD, INTENT_EXECUTION }

    address public immutable governance;
    IEmergencyDex public immutable dex;
    IEmergencyFutures public immutable futures;
    IEmergencyLending public immutable lending;
    IEmergencyPayout public immutable payout;
    uint256 public immutable futuresMarket;
    bytes32 public immutable lendingMarket;
    bytes32 private immutable dexHash;
    bytes32 private immutable futuresHash;
    bytes32 private immutable lendingHash;
    bytes32 private immutable payoutHash;

    IEmergencyLaunch public immutable launch;
    IEmergencyIntent public immutable intent;
    bytes32 private immutable launchHash;
    bytes32 private immutable intentGraph;

    address public guardian;
    uint256 public authorityEpoch = 1;
    uint256 public incidentNonce;

    error Unauthorized();
    error InvalidConfiguration();
    error StaleIncident();
    error TargetMismatch();

    struct CreatorRecovery {
        bytes32 commitment;
        uint256 authorityEpoch;
        uint256 incidentNonce;
        uint256 policy;
        uint256 serviceEpoch;
        uint256 recoveryNonce;
        bytes32 evidence;
        uint256 deadline;
    }

    event CreatorRecovered(bytes32 indexed commitment, uint256 indexed recoveryNonce, bytes32 evidence);
    event BundleRestricted(bytes32 indexed commitment, uint256 indexed nonce, bytes32 evidence);
    event GuardianChanged(address indexed guardian, uint256 indexed authorityEpoch);
    event EmergencyApplied(Scope indexed scope, uint256 indexed nonce, uint256 indexed authorityEpoch, bytes32 evidence);

    /// @dev Targets must be reviewed direct deployments. A proxy runtime hash alone cannot pin an implementation.
    constructor(address governance_, address guardian_, address[6] memory targets, uint256 futuresMarket_, bytes32 lendingMarket_) {
        if (governance_.code.length == 0 || guardian_ == address(0) || guardian_ == governance_ ||
            futuresMarket_ == 0 || lendingMarket_ == bytes32(0)) revert InvalidConfiguration();
        for (uint256 i; i < targets.length; ++i) {
            if (targets[i].code.length == 0) revert InvalidConfiguration();
            for (uint256 j; j < i; ++j) if (targets[i] == targets[j]) revert InvalidConfiguration();
        }
        governance = governance_;
        guardian = guardian_;
        dex = IEmergencyDex(targets[0]);
        futures = IEmergencyFutures(targets[1]);
        lending = IEmergencyLending(targets[2]);
        payout = IEmergencyPayout(targets[3]);
        futuresMarket = futuresMarket_;
        lendingMarket = lendingMarket_;
        dexHash = targets[0].codehash;
        futuresHash = targets[1].codehash;
        lendingHash = targets[2].codehash;
        payoutHash = targets[3].codehash;
        launch = IEmergencyLaunch(targets[4]);
        launchHash = targets[4].codehash;
        intent = IEmergencyIntent(targets[5]);
        intentGraph = _intentGraph();
        emit GuardianChanged(guardian_, authorityEpoch);
    }

    /// @notice Governance can revoke the Guardian by setting the zero address.
    function setGuardian(address next, uint256 expectedEpoch) external {
        if (msg.sender != governance) revert Unauthorized();
        if (next == governance || next == guardian) revert InvalidConfiguration();
        if (expectedEpoch != authorityEpoch) revert StaleIncident();
        guardian = next;
        emit GuardianChanged(next, ++authorityEpoch);
    }

    function _intentGraph() private view returns (bytes32) {
        address router = intent.router();
        address book = intent.quoteBook();
        address verifier = intent.settlementVerifier();
        if (router.code.length == 0 || book.code.length == 0 || verifier.code.length == 0
            || IRiskBinding(router).riskRegistry() != address(dex)
            || IHubBinding(book).hub() != address(intent) || IHubBinding(verifier).hub() != address(intent))
            revert TargetMismatch();
        return keccak256(abi.encode(address(intent), address(intent).codehash, router, router.codehash,
            book, book.codehash, verifier, verifier.codehash));
    }

    /// @notice Hash of the current five direct targets and the dependent Intent execution graph.
    function bundleCommitment() public view returns (bytes32) {
        bytes32 graph = _intentGraph();
        if (graph != intentGraph || intent.guardian() != address(this)) revert TargetMismatch();
        return keccak256(abi.encode(block.chainid, address(this), Scope.CONNECTED_SERVICES, governance, guardian,
            authorityEpoch, incidentNonce, _dexConfig(), _futuresConfig(), _lendingConfig(), _payoutConfig(), _launchConfig(), graph,
            intent.executionEpoch()));
    }

    function restrictBundle(bytes32 expectedCommitment, uint256 expectedEpoch, uint256 expectedNonce, bytes32 evidence, uint256 deadline) external {
        if (msg.sender != governance) revert Unauthorized();
        _checkRequest(expectedEpoch, expectedNonce, evidence, deadline);
        if (expectedCommitment != bundleCommitment()) revert TargetMismatch();

        ++incidentNonce;
        dex.pauseSwaps();
        futures.applyEmergencyTriggers(futuresMarket, false, false, false);
        lending.setMarketEnabled(lendingMarket, false);
        payout.setHold(true);
        launch.pauseLaunch();
        intent.setPaused(true);
        if (!intent.executionPaused() || _intentGraph() != intentGraph) revert TargetMismatch();
        emit BundleRestricted(expectedCommitment, expectedNonce, evidence);
        emit EmergencyApplied(Scope.CONNECTED_SERVICES, expectedNonce, expectedEpoch, evidence);
    }

    /// @notice Guardians may restrict a single service. The legacy selector cannot submit a bundle.
    function restrict(Scope scope, uint256 expectedEpoch, uint256 expectedNonce, bytes32 evidence, uint256 deadline) external {
        if (msg.sender != guardian && msg.sender != governance) revert Unauthorized();
        _checkRequest(expectedEpoch, expectedNonce, evidence, deadline);
        ++incidentNonce;
        if (scope == Scope.DEX) {
            _dexConfig();
            dex.pauseSwaps();
        } else if (scope == Scope.FUTURES) {
            _futuresConfig();
            futures.applyEmergencyTriggers(futuresMarket, false, false, false);
        } else if (scope == Scope.LENDING) {
            _lendingConfig();
            lending.setMarketEnabled(lendingMarket, false);
        } else if (scope == Scope.CREATOR) {
            _payoutConfig();
            payout.setHold(true);
        } else if (scope == Scope.LAUNCHPAD) {
            _launchConfig();
            launch.pauseLaunch();
        } else if (scope == Scope.INTENT_EXECUTION) {
            if (_intentGraph() != intentGraph || intent.guardian() != address(this)) revert TargetMismatch();
            intent.setPaused(true);
        } else revert InvalidConfiguration();
        emit EmergencyApplied(scope, expectedNonce, expectedEpoch, evidence);
    }

    function _checkRequest(uint256 epoch, uint256 nonce, bytes32 evidence, uint256 deadline) private view {
        if (epoch != authorityEpoch || nonce != incidentNonce || block.timestamp > deadline || evidence == bytes32(0))
            revert StaleIncident();
    }

    function _dexConfig() private view returns (bytes32) {
        if (address(dex).codehash != dexHash || dex.pauseAdmin() != address(this)) revert TargetMismatch();
        return keccak256(abi.encode(address(dex), dexHash, dex.recoveryConfigHash()));
    }

    function _futuresConfig() private view returns (bytes32) {
        if (address(futures).codehash != futuresHash || futures.guardian() != address(this)) revert TargetMismatch();
        return keccak256(abi.encode(address(futures), futuresHash, futuresMarket, futures.recoveryApprovalEpoch(futuresMarket),
            futures.recoveryOracleConfigHash(futuresMarket), _futuresMarketConfig()));
    }

    function _futuresMarketConfig() private view returns (bytes32) {
        (bytes32 symbol,address index,address collateral,address oracle,uint32 leverage,uint32 maintenance,bool active) =
            futures.markets(futuresMarket);
        return keccak256(abi.encode(symbol,index,collateral,oracle,leverage,maintenance,active));
    }

    function _lendingConfig() private view returns (bytes32) {
        if (address(lending).codehash != lendingHash || lending.guardian() != address(this)) revert TargetMismatch();
        return keccak256(abi.encode(address(lending), lendingHash, lendingMarket, lending.recoveryConfigHash(lendingMarket)));
    }

    function creatorRecoveryCommitment() public view returns (bytes32) {
        return keccak256(abi.encode(block.chainid, address(this), Scope.CREATOR, governance, guardian,
            authorityEpoch, incidentNonce, _payoutConfig(), payout.vault(), payout.risk(), payout.held(), payout.recoveryNonce()));
    }

    function recoverCreator(CreatorRecovery calldata request) external {
        if (msg.sender != governance) revert Unauthorized();
        _checkRequest(request.authorityEpoch, request.incidentNonce, request.evidence, request.deadline);
        if (request.commitment != creatorRecoveryCommitment()) revert TargetMismatch();
        payout.recoverHold(request.policy, request.serviceEpoch, request.recoveryNonce);
        emit CreatorRecovered(request.commitment, request.recoveryNonce, request.evidence);
    }

    function _payoutConfig() private view returns (bytes32) {
        if (address(payout).codehash != payoutHash || payout.guardian() != address(this)) revert TargetMismatch();
        return keccak256(abi.encode(address(payout), payoutHash, payout.epoch(), payout.policyVersion()));
    }

    function _launchConfig() private view returns (bytes32) {
        if (address(launch).codehash != launchHash || launch.guardian() != address(this)) revert TargetMismatch();
        return keccak256(abi.encode(address(launch), launchHash, launch.emergencyEpoch()));
    }
}
