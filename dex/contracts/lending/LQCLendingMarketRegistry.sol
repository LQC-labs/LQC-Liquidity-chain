// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface ILQCLendingOracle {
    function getPrices(address asset) external view returns (uint256 collateralPrice, uint256 debtPrice);
}

/// @notice Governance-controlled risk boundaries for isolated LQC Lending markets.
/// @dev This registry moves no funds and creates no debt. The Lending core must enforce these checks.
contract LQCLendingMarketRegistry {
    uint256 public constant BPS = 10_000;
    uint256 public constant MAX_LTV_BPS = 5_000;
    uint256 public constant MAX_LIQUIDATION_THRESHOLD_BPS = 8_500;
    uint256 public constant MAX_LIQUIDATION_BONUS_BPS = 1_000;

    struct MarketConfig {
        address collateralAsset;
        address debtAsset;
        uint8 collateralDecimals;
        uint8 debtDecimals;
        uint16 maxLtvBps;
        uint16 liquidationThresholdBps;
        uint16 liquidationBonusBps;
        uint128 supplyCap;
        uint128 borrowCap;
        uint128 minBorrow;
        bool enabled;
    }

    struct AccountRisk {
        uint256 collateralValue;
        uint256 debtValue;
        uint256 maxDebtValue;
        uint256 liquidationDebtValue;
        uint256 healthFactor;
        bool borrowAllowed;
        bool liquidatable;
    }

    address public owner;
    address public pendingOwner;
    address public guardian;
    ILQCLendingOracle public immutable oracle;
    mapping(bytes32 marketId => MarketConfig) private markets;

    event MarketConfigured(bytes32 indexed marketId, address indexed collateralAsset, address indexed debtAsset);
    event MarketStatusChanged(bytes32 indexed marketId, bool enabled);
    event GuardianUpdated(address indexed previousGuardian, address indexed newGuardian);
    event OwnershipTransferStarted(address indexed owner, address indexed pendingOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    error Unauthorized();
    error ZeroAddress();
    error InvalidMarket();
    error MarketNotFound();
    error MarketDisabled();
    error CapExceeded();

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    constructor(address owner_, address guardian_, address oracle_) {
        if (owner_ == address(0) || guardian_ == address(0) || oracle_ == address(0)) revert ZeroAddress();
        owner = owner_;
        guardian = guardian_;
        oracle = ILQCLendingOracle(oracle_);
        emit OwnershipTransferred(address(0), owner_);
        emit GuardianUpdated(address(0), guardian_);
    }

    function marketId(address collateralAsset, address debtAsset) public pure returns (bytes32) {
        return keccak256(abi.encode(collateralAsset, debtAsset));
    }

    function configureMarket(MarketConfig calldata config) external onlyOwner returns (bytes32 id) {
        if (
            config.collateralAsset == address(0) || config.debtAsset == address(0)
                || config.collateralAsset == config.debtAsset || config.collateralDecimals > 18 || config.debtDecimals > 18
                || config.maxLtvBps == 0 || config.maxLtvBps > MAX_LTV_BPS
                || config.liquidationThresholdBps <= config.maxLtvBps
                || config.liquidationThresholdBps > MAX_LIQUIDATION_THRESHOLD_BPS
                || config.liquidationBonusBps > MAX_LIQUIDATION_BONUS_BPS || config.supplyCap == 0
                || config.borrowCap == 0 || config.minBorrow == 0 || config.minBorrow > config.borrowCap
        ) revert InvalidMarket();
        id = marketId(config.collateralAsset, config.debtAsset);
        markets[id] = config;
        emit MarketConfigured(id, config.collateralAsset, config.debtAsset);
        emit MarketStatusChanged(id, config.enabled);
    }

    function getMarket(bytes32 id) external view returns (MarketConfig memory config) {
        config = markets[id];
        if (config.collateralAsset == address(0)) revert MarketNotFound();
    }

    function setMarketEnabled(bytes32 id, bool enabled) external {
        MarketConfig storage config = markets[id];
        if (config.collateralAsset == address(0)) revert MarketNotFound();
        if (enabled) {
            if (msg.sender != owner) revert Unauthorized();
        } else if (msg.sender != owner && msg.sender != guardian) {
            revert Unauthorized();
        }
        config.enabled = enabled;
        emit MarketStatusChanged(id, enabled);
    }

    function validateCaps(bytes32 id, uint256 totalSupplyAfter, uint256 totalBorrowAfter) external view {
        MarketConfig memory config = _enabledMarket(id);
        if (totalSupplyAfter > config.supplyCap || totalBorrowAfter > config.borrowCap) revert CapExceeded();
        if (totalBorrowAfter != 0 && totalBorrowAfter < config.minBorrow) revert InvalidMarket();
    }

    function accountRisk(bytes32 id, uint256 collateralAmount, uint256 debtAmount)
        external
        view
        returns (AccountRisk memory risk)
    {
        MarketConfig memory config = _enabledMarket(id);
        (uint256 collateralPrice,) = oracle.getPrices(config.collateralAsset);
        (, uint256 debtPrice) = oracle.getPrices(config.debtAsset);
        risk.collateralValue = collateralAmount * collateralPrice / (10 ** config.collateralDecimals);
        risk.debtValue = debtAmount * debtPrice / (10 ** config.debtDecimals);
        risk.maxDebtValue = risk.collateralValue * config.maxLtvBps / BPS;
        risk.liquidationDebtValue = risk.collateralValue * config.liquidationThresholdBps / BPS;
        if (risk.debtValue == 0) {
            risk.healthFactor = type(uint256).max;
        } else {
            risk.healthFactor = risk.liquidationDebtValue * 1e18 / risk.debtValue;
        }
        risk.borrowAllowed = risk.debtValue <= risk.maxDebtValue;
        risk.liquidatable = risk.debtValue > risk.liquidationDebtValue;
    }

    function _enabledMarket(bytes32 id) private view returns (MarketConfig memory config) {
        config = markets[id];
        if (config.collateralAsset == address(0)) revert MarketNotFound();
        if (!config.enabled) revert MarketDisabled();
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
