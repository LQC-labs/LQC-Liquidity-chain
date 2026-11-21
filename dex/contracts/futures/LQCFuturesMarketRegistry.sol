// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ILQCFuturesOracle} from "./ILQCFuturesOracle.sol";

interface IMarketBoundRecoveryOracle {
    function indexToken() external view returns (address);
}

interface IAggregatorRecoveryOracle {
    function configVersion(address indexToken) external view returns (uint256);
    function feedConfigs(address indexToken)
        external view returns (address feed, uint32 heartbeat, address referenceFeed, uint16 maxDeviationBps);
}

/// @notice Registry for LQC Flow perpetual/futures markets.
/// @dev Stores market configuration only. Position, margin and settlement logic live in separate contracts.
contract LQCFuturesMarketRegistry {
    uint256 public constant RECOVERY_MAX_ORACLE_AGE = 120;

    uint32 private constant MAX_RECOVERY_HEARTBEAT = 1 days;
    uint16 private constant MAX_RECOVERY_DEVIATION_BPS = 5_000;

    enum MarketMode { ACTIVE, REDUCE_ONLY, HALTED }
    struct Market {
        bytes32 symbol;
        address indexToken;
        address collateralToken;
        address oracle;
        uint32 maxLeverageBps;
        uint32 maintenanceMarginBps;
        bool active;
    }

    address public owner;
    address public pendingOwner;
    address public guardian;
    uint256 public marketCount;

    mapping(uint256 => Market) public markets;
    mapping(bytes32 => uint256) public marketIdBySymbol;
    mapping(uint256 => MarketMode) public marketMode;
    mapping(uint256 => bool) private _recoveryApproved;
    mapping(uint256 => address) public recoveryOracle;
    mapping(uint256 => bytes32) public recoveryOracleCodehash;
    mapping(uint256 => uint256) public recoveryOracleApprovalValidUntil;
    mapping(uint256 => uint256) public recoveryActivationValidUntil;
    mapping(uint256 => bytes32) public recoveryOracleConfigHash;
    mapping(uint256 => bool) public recoveryOracleUsesAggregator;
    mapping(uint256 => uint256) public recoveryOracleConfigVersion;
    mapping(uint256 => uint256) public recoveryApprovalEpoch;

    event MarketAdded(uint256 indexed marketId, bytes32 indexed symbol, address indexToken, address collateralToken, address oracle);
    event MarketStatusChanged(uint256 indexed marketId, bool active);
    event MarketModeChanged(uint256 indexed marketId, MarketMode previousMode, MarketMode newMode);
    event GuardianChanged(address indexed previousGuardian, address indexed newGuardian);
    event EmergencyTriggerApplied(uint256 indexed marketId, bool oracleHealthy, bool circuitBreakerAllowed, bool residualBadDebt, MarketMode resultingMode);
    event RecoveryOracleApproved(uint256 indexed marketId, address indexed oracle, bytes32 codehash);
    event RecoveryOracleConfigApproved(uint256 indexed marketId, bytes32 indexed configHash, bool aggregator);
    event RecoveryOracleVersionApproved(uint256 indexed marketId, uint256 indexed version);
    event RecoveryActivationApproved(uint256 indexed marketId, uint256 indexed epoch, uint256 validUntil);
    event RecoveryApprovalChanged(uint256 indexed marketId, bool approved);
    event MarketRiskUpdated(uint256 indexed marketId, uint32 maxLeverageBps, uint32 maintenanceMarginBps);
    event MarketOracleUpdated(uint256 indexed marketId, address indexed oracle);
    event OwnershipTransferStarted(address indexed currentOwner, address indexed pendingOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    error Forbidden();
    error UnapprovedRecoveryOracle();
    error InvalidRecoveryPrice();
    error RecoveryApprovalExpired();
    error RecoveryApprovalMismatch();
    error ZeroAddress();
    error InvalidSymbol();
    error MarketExists();
    error MarketNotFound();
    error InvalidRiskParameters();

    modifier onlyOwner() {
        if (msg.sender != owner) revert Forbidden();
        _;
    }

    modifier onlyOwnerOrGuardian() {
        if (msg.sender != owner && msg.sender != guardian) revert Forbidden();
        _;
    }

    constructor(address owner_) {
        if (owner_ == address(0)) revert ZeroAddress();
        owner = owner_;
        emit OwnershipTransferred(address(0), owner_);
    }

    function addMarket(
        bytes32 symbol,
        address indexToken,
        address collateralToken,
        address oracle,
        uint32 maxLeverageBps,
        uint32 maintenanceMarginBps
    ) external onlyOwner returns (uint256 marketId) {
        if (symbol == bytes32(0)) revert InvalidSymbol();
        if (indexToken == address(0) || collateralToken == address(0) || oracle == address(0)) revert ZeroAddress();
        if (marketIdBySymbol[symbol] != 0) revert MarketExists();
        if (maxLeverageBps < 10_000 || maintenanceMarginBps == 0 || maintenanceMarginBps >= 10_000) {
            revert InvalidRiskParameters();
        }

        marketId = ++marketCount;
        markets[marketId] = Market({
            symbol: symbol,
            indexToken: indexToken,
            collateralToken: collateralToken,
            oracle: oracle,
            maxLeverageBps: maxLeverageBps,
            maintenanceMarginBps: maintenanceMarginBps,
            active: false
        });
        marketIdBySymbol[symbol] = marketId;
        marketMode[marketId] = MarketMode.HALTED;
        emit MarketAdded(marketId, symbol, indexToken, collateralToken, oracle);
        emit MarketStatusChanged(marketId, false);
    }

    function setGuardian(address newGuardian) external onlyOwner {
        if (newGuardian == address(0)) revert ZeroAddress();
        address previous = guardian;
        guardian = newGuardian;
        emit GuardianChanged(previous, newGuardian);
    }

    /// @notice Guardian may only escalate restrictions; only Governance may restore ACTIVE or loosen HALTED.
    function setEmergencyMarketMode(uint256 marketId, MarketMode newMode) external onlyOwnerOrGuardian {
        _requireMarket(marketId);
        MarketMode previous = marketMode[marketId];
        if (msg.sender == guardian) {
            if (newMode == MarketMode.ACTIVE || uint8(newMode) < uint8(previous)) revert Forbidden();
        }
        _setMode(marketId, newMode);
    }

    /// @notice Applies fail-closed emergency signals supplied by an authorized Guardian/Governance monitor.
    /// @dev This function may only tighten restrictions. Recovery remains a separate Governance action.
    function applyEmergencyTriggers(uint256 marketId, bool oracleHealthy, bool circuitBreakerAllowed, bool hasResidualBadDebt) external onlyOwnerOrGuardian {
        _requireMarket(marketId);
        MarketMode current = marketMode[marketId];
        MarketMode target = current;
        if (!oracleHealthy || !circuitBreakerAllowed) target = MarketMode.HALTED;
        else if (hasResidualBadDebt && current == MarketMode.ACTIVE) target = MarketMode.REDUCE_ONLY;
        if (uint8(target) < uint8(current)) revert Forbidden();
        if (target != current) {
            _setMode(marketId, target);
        }
        emit EmergencyTriggerApplied(marketId, oracleHealthy, circuitBreakerAllowed, hasResidualBadDebt, marketMode[marketId]);
    }

    /// @notice Governance pins a single-token Oracle to the market's configured index token.
    function approveRecoveryOracle(uint256 marketId, address expectedOracle, bytes32 expectedCodehash) external onlyOwner {
        _approveRecoveryOracle(marketId, expectedOracle, expectedCodehash, false, bytes32(0), 0);
    }

    /// @notice Governance explicitly approves the selected token's Aggregator configuration.
    /// @dev configHash = keccak256(abi.encode(indexToken, feed, heartbeat, referenceFeed, maxDeviationBps)).
    function approveAggregatorRecoveryOracle(
        uint256 marketId, address expectedOracle, bytes32 expectedCodehash, bytes32 expectedConfigHash,
        uint256 expectedConfigVersion
    ) external onlyOwner {
        if (expectedConfigHash == bytes32(0) || expectedConfigVersion == 0) revert UnapprovedRecoveryOracle();
        _approveRecoveryOracle(marketId, expectedOracle, expectedCodehash, true, expectedConfigHash, expectedConfigVersion);
    }

    /// @dev Codehash is a runtime pin. Governance must separately verify feed and proxy implementation provenance.
    function _approveRecoveryOracle(
        uint256 marketId, address expectedOracle, bytes32 expectedCodehash, bool aggregator, bytes32 expectedConfigHash,
        uint256 expectedConfigVersion
    ) private {
        _requireMarket(marketId);
        if (marketMode[marketId] != MarketMode.HALTED) revert Forbidden();
        Market storage market = markets[marketId];
        address oracle = market.oracle;
        if (expectedOracle != oracle || oracle.code.length == 0 || expectedCodehash != oracle.codehash)
            revert UnapprovedRecoveryOracle();
        bytes32 configHash = _oracleConfigHash(market, aggregator);
        if (configHash == bytes32(0) || (aggregator && (expectedConfigHash != configHash ||
            expectedConfigVersion != _aggregatorVersion(market)))) revert UnapprovedRecoveryOracle();
        uint256 updatedAt = _requireFreshRecoveryPrice(marketId);
        recoveryOracle[marketId] = oracle;
        recoveryOracleCodehash[marketId] = expectedCodehash;
        recoveryOracleConfigHash[marketId] = configHash;
        recoveryOracleUsesAggregator[marketId] = aggregator;
        recoveryOracleConfigVersion[marketId] = expectedConfigVersion;
        recoveryOracleApprovalValidUntil[marketId] = updatedAt + RECOVERY_MAX_ORACLE_AGE;
        _invalidateRecoveryRequest(marketId);
        emit RecoveryOracleApproved(marketId, oracle, expectedCodehash);
        emit RecoveryOracleConfigApproved(marketId, configHash, aggregator);
        if (aggregator) emit RecoveryOracleVersionApproved(marketId, expectedConfigVersion);
    }

    /// @notice Reports current runtime and configuration approval. Execution also checks price freshness.
    function isRecoveryOracleApproved(uint256 marketId) public view returns (bool) {
        Market storage market = markets[marketId];
        address oracle = market.oracle;
        bytes32 configHash = recoveryOracleConfigHash[marketId];
        if (configHash == bytes32(0) || recoveryOracleApprovalValidUntil[marketId] == 0 || oracle != recoveryOracle[marketId] ||
            oracle.code.length == 0 || oracle.codehash != recoveryOracleCodehash[marketId]) return false;
        bool aggregator = recoveryOracleUsesAggregator[marketId];
        if (aggregator) {
            uint256 approvedVersion = recoveryOracleConfigVersion[marketId];
            if (approvedVersion == 0 || approvedVersion != _aggregatorVersion(market)) return false;
        }
        return configHash == _oracleConfigHash(market, aggregator);
    }

    /// @notice Effective pending activation approval. An expired quote lease cannot be revived by a later quote.
    function recoveryApproved(uint256 marketId) public view returns (bool) {
        return _recoveryApproved[marketId] && recoveryActivationValidUntil[marketId] >= block.timestamp &&
            recoveryActivationValidUntil[marketId] != 0 && isRecoveryOracleApproved(marketId) &&
            _freshRecoveryQuoteTimestamp(marketId) != 0;
    }

    /// @notice Legacy approval entry point is retained for revocation only.
    function setRecoveryApproved(uint256 marketId, bool approved) external onlyOwner {
        _requireMarket(marketId);
        if (approved) revert RecoveryApprovalMismatch();
        _invalidateRecoveryRequest(marketId);
    }

    /// @notice Authorizes activation for one specific Oracle nomination and recovery cycle.
    function approveRecoveryActivation(
        uint256 marketId, address expectedOracle, bytes32 expectedCodehash, bytes32 expectedConfigHash,
        uint256 expectedConfigVersion, uint256 expectedEpoch, uint256 validUntil
    ) external onlyOwner {
        _requireMarket(marketId);
        if (marketMode[marketId] != MarketMode.REDUCE_ONLY) revert Forbidden();
        if (expectedOracle != recoveryOracle[marketId] || expectedCodehash != recoveryOracleCodehash[marketId] ||
            expectedConfigHash != recoveryOracleConfigHash[marketId] || expectedConfigVersion != recoveryOracleConfigVersion[marketId] ||
            expectedEpoch != recoveryApprovalEpoch[marketId]) revert RecoveryApprovalMismatch();
        if (validUntil < block.timestamp || validUntil == 0) revert RecoveryApprovalExpired();
        uint256 updatedAt = _requireRecoveryOracle(marketId);
        if (validUntil > updatedAt + RECOVERY_MAX_ORACLE_AGE) revert InvalidRecoveryPrice();
        _recoveryApproved[marketId] = true;
        recoveryActivationValidUntil[marketId] = validUntil;
        emit RecoveryApprovalChanged(marketId, true);
        emit RecoveryActivationApproved(marketId, expectedEpoch, validUntil);
    }

    function setMarketMode(uint256 marketId, MarketMode newMode) external onlyOwner {
        _requireMarket(marketId);
        _setMode(marketId, newMode);
    }

    function _setMode(uint256 marketId, MarketMode newMode) private {
        MarketMode previous = marketMode[marketId];
        if (newMode == MarketMode.ACTIVE) {
            if (previous == MarketMode.HALTED) revert Forbidden();
            if (previous == MarketMode.REDUCE_ONLY && !_recoveryApproved[marketId]) revert Forbidden();
            _requireRecoveryOracle(marketId);
            if (previous == MarketMode.REDUCE_ONLY && (recoveryActivationValidUntil[marketId] == 0 ||
                recoveryActivationValidUntil[marketId] < block.timestamp)) revert RecoveryApprovalExpired();
        } else if (newMode == MarketMode.REDUCE_ONLY) {
            if (previous == MarketMode.HALTED) {
                _requireRecoveryOracle(marketId);
                if (recoveryOracleApprovalValidUntil[marketId] < block.timestamp) revert RecoveryApprovalExpired();
            } else if (previous == MarketMode.ACTIVE &&
                (!isRecoveryOracleApproved(marketId) || _freshRecoveryQuoteTimestamp(marketId) == 0)) {
                // A Guardian must still be able to tighten when quotes are unusable.
                newMode = MarketMode.HALTED;
            }
        }

        if (newMode != previous && (previous == MarketMode.ACTIVE || newMode == MarketMode.HALTED)) {
            _invalidateRecoveryRequest(marketId);
        } else if (newMode != MarketMode.REDUCE_ONLY) {
            _clearRecoveryApproval(marketId);
        }
        if (newMode == MarketMode.HALTED) _clearRecoveryOracle(marketId);
        marketMode[marketId] = newMode;
        markets[marketId].active = newMode != MarketMode.HALTED;
        emit MarketModeChanged(marketId, previous, newMode);
        emit MarketStatusChanged(marketId, markets[marketId].active);
    }

    function _invalidateRecoveryRequest(uint256 marketId) private {
        recoveryApprovalEpoch[marketId] += 1;
        _clearRecoveryApproval(marketId);
    }

    function _clearRecoveryApproval(uint256 marketId) private {
        if (!_recoveryApproved[marketId]) return;
        delete _recoveryApproved[marketId];
        delete recoveryActivationValidUntil[marketId];
        emit RecoveryApprovalChanged(marketId, false);
    }

    function _clearRecoveryOracle(uint256 marketId) private {
        delete recoveryOracle[marketId];
        delete recoveryOracleCodehash[marketId];
        delete recoveryOracleApprovalValidUntil[marketId];
        delete recoveryOracleConfigHash[marketId];
        delete recoveryOracleUsesAggregator[marketId];
        delete recoveryOracleConfigVersion[marketId];
    }

    function _requireRecoveryOracle(uint256 marketId) private view returns (uint256) {
        if (!isRecoveryOracleApproved(marketId)) revert UnapprovedRecoveryOracle();
        return _requireFreshRecoveryPrice(marketId);
    }

    function _aggregatorVersion(Market storage market) private view returns (uint256) {
        try IAggregatorRecoveryOracle(market.oracle).configVersion(market.indexToken) returns (uint256 version) {
            return version;
        } catch {
            return 0;
        }
    }

    function _oracleConfigHash(Market storage market, bool aggregator) private view returns (bytes32) {
        if (!aggregator) {
            try IMarketBoundRecoveryOracle(market.oracle).indexToken() returns (address fixedToken) {
                if (fixedToken == market.indexToken) return keccak256(abi.encode(fixedToken));
            } catch {}
            return bytes32(0);
        }
        address token = market.indexToken;
        try IAggregatorRecoveryOracle(market.oracle).feedConfigs(token)
            returns (address feed, uint32 heartbeat, address referenceFeed, uint16 deviation)
        {
            if (feed.code.length == 0 || heartbeat == 0 || heartbeat > MAX_RECOVERY_HEARTBEAT) return bytes32(0);
            if (referenceFeed == address(0)) {
                if (deviation != 0) return bytes32(0);
            } else if (referenceFeed == feed || referenceFeed.code.length == 0 ||
                deviation == 0 || deviation > MAX_RECOVERY_DEVIATION_BPS) {
                return bytes32(0);
            }
            return keccak256(abi.encode(token, feed, heartbeat, referenceFeed, deviation));
        } catch {
            return bytes32(0);
        }
    }

    function _requireFreshRecoveryPrice(uint256 marketId) private view returns (uint256 updatedAt) {
        updatedAt = _freshRecoveryQuoteTimestamp(marketId);
        if (updatedAt == 0) revert InvalidRecoveryPrice();
    }

    function _freshRecoveryQuoteTimestamp(uint256 marketId) private view returns (uint256) {
        Market storage market = markets[marketId];
        try ILQCFuturesOracle(market.oracle).getPrice(market.indexToken) returns (uint256 price, uint256 updatedAt) {
            if (price != 0 && updatedAt != 0 && updatedAt <= block.timestamp &&
                block.timestamp - updatedAt <= RECOVERY_MAX_ORACLE_AGE) return updatedAt;
        } catch {}
        return 0;
    }

    function setMarketActive(uint256 marketId, bool active) external onlyOwner {
        _requireMarket(marketId);
        _setMode(marketId, active ? MarketMode.ACTIVE : MarketMode.HALTED);
    }

    function setRiskParameters(uint256 marketId, uint32 maxLeverageBps, uint32 maintenanceMarginBps) external onlyOwner {
        _requireMarket(marketId);
        if (maxLeverageBps < 10_000 || maintenanceMarginBps == 0 || maintenanceMarginBps >= 10_000) {
            revert InvalidRiskParameters();
        }
        Market storage market = markets[marketId];
        market.maxLeverageBps = maxLeverageBps;
        market.maintenanceMarginBps = maintenanceMarginBps;
        emit MarketRiskUpdated(marketId, maxLeverageBps, maintenanceMarginBps);
    }

    function setOracle(uint256 marketId, address oracle) external onlyOwner {
        _requireMarket(marketId);
        if (oracle == address(0)) revert ZeroAddress();
        if (marketMode[marketId] != MarketMode.HALTED) revert Forbidden();
        _invalidateRecoveryRequest(marketId);
        _clearRecoveryOracle(marketId);
        markets[marketId].oracle = oracle;
        emit MarketOracleUpdated(marketId, oracle);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        pendingOwner = newOwner;
        emit OwnershipTransferStarted(owner, newOwner);
    }

    function acceptOwnership() external {
        if (msg.sender != pendingOwner) revert Forbidden();
        address previousOwner = owner;
        owner = msg.sender;
        pendingOwner = address(0);
        emit OwnershipTransferred(previousOwner, msg.sender);
    }

    function _requireMarket(uint256 marketId) private view {
        if (marketId == 0 || marketId > marketCount) revert MarketNotFound();
    }
}
