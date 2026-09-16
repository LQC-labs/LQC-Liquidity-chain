// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ILQCPriceFeed} from "../router-v2/interfaces/ILQCPriceFeed.sol";

/// @notice Fail-closed dual-feed prices for LQC Lending markets.
/// @dev Collateral uses the lower price while debt uses the higher price.
contract LQCOracleManager {
    uint256 public constant BPS = 10_000;
    uint256 public constant MAX_DEVIATION_BPS = 2_000;
    uint256 public constant MAX_FEED_DECIMALS = 18;

    struct AssetConfig {
        address primary;
        address secondary;
        uint32 maxAge;
        uint16 maxDeviationBps;
        bool enabled;
    }

    address public owner;
    address public pendingOwner;
    address public guardian;
    mapping(address asset => AssetConfig) public assetConfigs;

    event AssetConfigured(
        address indexed asset,
        address indexed primary,
        address indexed secondary,
        uint256 maxAge,
        uint256 maxDeviationBps
    );
    event AssetStatusChanged(address indexed asset, bool enabled);
    event GuardianUpdated(address indexed previousGuardian, address indexed newGuardian);
    event OwnershipTransferStarted(address indexed owner, address indexed pendingOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    error Unauthorized();
    error ZeroAddress();
    error InvalidConfig();
    error AssetDisabled();
    error InvalidPrice();
    error StalePrice();
    error IncompleteRound();
    error ExcessiveDeviation();

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

    function configureAsset(
        address asset,
        address primary,
        address secondary,
        uint32 maxAge,
        uint16 maxDeviationBps
    ) external onlyOwner {
        if (asset == address(0) || primary == address(0) || secondary == address(0)) revert ZeroAddress();
        if (
            primary == secondary || maxAge < 60 || maxAge > 2 days || maxDeviationBps == 0
                || maxDeviationBps > MAX_DEVIATION_BPS
        ) revert InvalidConfig();
        if (ILQCPriceFeed(primary).decimals() > MAX_FEED_DECIMALS) revert InvalidConfig();
        if (ILQCPriceFeed(secondary).decimals() > MAX_FEED_DECIMALS) revert InvalidConfig();
        assetConfigs[asset] = AssetConfig(primary, secondary, maxAge, maxDeviationBps, true);
        emit AssetConfigured(asset, primary, secondary, maxAge, maxDeviationBps);
        emit AssetStatusChanged(asset, true);
    }

    function setAssetEnabled(address asset, bool enabled) external {
        AssetConfig storage config = assetConfigs[asset];
        if (config.primary == address(0)) revert InvalidConfig();
        if (enabled) {
            if (msg.sender != owner) revert Unauthorized();
        } else if (msg.sender != owner && msg.sender != guardian) {
            revert Unauthorized();
        }
        config.enabled = enabled;
        emit AssetStatusChanged(asset, enabled);
    }

    function getPrices(address asset) external view returns (uint256 collateralPrice, uint256 debtPrice) {
        AssetConfig memory config = assetConfigs[asset];
        if (!config.enabled) revert AssetDisabled();
        uint256 primaryPrice = _read(config.primary, config.maxAge);
        uint256 secondaryPrice = _read(config.secondary, config.maxAge);
        collateralPrice = primaryPrice < secondaryPrice ? primaryPrice : secondaryPrice;
        debtPrice = primaryPrice > secondaryPrice ? primaryPrice : secondaryPrice;
        if ((debtPrice - collateralPrice) * BPS > collateralPrice * config.maxDeviationBps) {
            revert ExcessiveDeviation();
        }
    }

    function _read(address feed, uint32 maxAge) private view returns (uint256 normalizedPrice) {
        (uint80 roundId, int256 answer,, uint256 updatedAt, uint80 answeredInRound) =
            ILQCPriceFeed(feed).latestRoundData();
        if (answer <= 0 || updatedAt == 0 || updatedAt > block.timestamp) revert InvalidPrice();
        if (answeredInRound < roundId) revert IncompleteRound();
        if (block.timestamp - updatedAt > maxAge) revert StalePrice();
        uint8 decimals = ILQCPriceFeed(feed).decimals();
        normalizedPrice = uint256(answer) * (10 ** (18 - decimals));
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
