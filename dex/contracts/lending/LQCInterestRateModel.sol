// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Bounded kink-rate model for isolated LQC Lending markets.
contract LQCInterestRateModel {
    uint256 public constant BPS = 10_000;
    uint256 public constant RAY = 1e27;
    uint256 public constant SECONDS_PER_YEAR = 365 days;
    uint256 public constant MAX_BORROW_APR_BPS = 20_000;
    uint256 public constant MAX_RESERVE_FACTOR_BPS = 3_000;

    struct RateConfig {
        uint16 baseAprBps;
        uint16 slope1AprBps;
        uint16 slope2AprBps;
        uint16 optimalUtilizationBps;
        uint16 reserveFactorBps;
        bool enabled;
    }

    address public owner;
    address public pendingOwner;
    address public guardian;
    mapping(bytes32 marketId => RateConfig) public rateConfigs;

    event RateConfigured(bytes32 indexed marketId, uint256 baseAprBps, uint256 optimalUtilizationBps);
    event RateStatusChanged(bytes32 indexed marketId, bool enabled);
    event GuardianUpdated(address indexed previousGuardian, address indexed newGuardian);
    event OwnershipTransferStarted(address indexed owner, address indexed pendingOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    error Unauthorized();
    error InvalidConfig();
    error ModelDisabled();
    error InvalidLiquidity();
    error ZeroAddress();

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    constructor(address owner_, address guardian_) {
        if (owner_ == address(0) || guardian_ == address(0)) revert ZeroAddress();
        owner = owner_;
        guardian = guardian_;
        emit OwnershipTransferred(address(0), owner_);
        emit GuardianUpdated(address(0), guardian_);
    }

    function configureRate(bytes32 id, RateConfig calldata config) external onlyOwner {
        uint256 peakApr = uint256(config.baseAprBps) + config.slope1AprBps + config.slope2AprBps;
        if (
            id == bytes32(0) || config.optimalUtilizationBps < 5_000 || config.optimalUtilizationBps > 9_500
                || config.reserveFactorBps > MAX_RESERVE_FACTOR_BPS || peakApr == 0
                || peakApr > MAX_BORROW_APR_BPS
        ) revert InvalidConfig();
        rateConfigs[id] = config;
        emit RateConfigured(id, config.baseAprBps, config.optimalUtilizationBps);
        emit RateStatusChanged(id, config.enabled);
    }

    function setRateEnabled(bytes32 id, bool enabled) external {
        RateConfig storage config = rateConfigs[id];
        if (config.optimalUtilizationBps == 0) revert InvalidConfig();
        if (enabled) {
            if (msg.sender != owner) revert Unauthorized();
        } else if (msg.sender != owner && msg.sender != guardian) {
            revert Unauthorized();
        }
        config.enabled = enabled;
        emit RateStatusChanged(id, enabled);
    }

    function rates(bytes32 id, uint256 totalBorrow, uint256 totalLiquidity)
        external view returns (uint256 borrowRatePerSecondRay, uint256 supplyRatePerSecondRay, uint256 utilizationRay)
    {
        RateConfig memory config = rateConfigs[id];
        if (!config.enabled) revert ModelDisabled();
        if (totalBorrow > totalLiquidity) revert InvalidLiquidity();
        utilizationRay = totalLiquidity == 0 ? 0 : totalBorrow * RAY / totalLiquidity;
        uint256 optimalRay = uint256(config.optimalUtilizationBps) * RAY / BPS;
        uint256 borrowAprBps;
        if (utilizationRay <= optimalRay) {
            borrowAprBps = uint256(config.baseAprBps) + uint256(config.slope1AprBps) * utilizationRay / optimalRay;
        } else {
            borrowAprBps = uint256(config.baseAprBps) + config.slope1AprBps
                + uint256(config.slope2AprBps) * (utilizationRay - optimalRay) / (RAY - optimalRay);
        }
        borrowRatePerSecondRay = borrowAprBps * RAY / BPS / SECONDS_PER_YEAR;
        supplyRatePerSecondRay = borrowRatePerSecondRay * utilizationRay / RAY
            * (BPS - config.reserveFactorBps) / BPS;
    }

    function setGuardian(address newGuardian) external onlyOwner {
        if (newGuardian == address(0)) revert ZeroAddress();
        emit GuardianUpdated(guardian, newGuardian);
        guardian = newGuardian;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        pendingOwner = newOwner;
        emit OwnershipTransferStarted(owner, newOwner);
    }

    function acceptOwnership() external {
        if (msg.sender != pendingOwner) revert Unauthorized();
        address previousOwner = owner;
        owner = msg.sender;
        pendingOwner = address(0);
        emit OwnershipTransferred(previousOwner, msg.sender);
    }
}
