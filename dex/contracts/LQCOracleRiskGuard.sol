// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ILQCPriceSource} from "./interfaces/ILQCPriceSource.sol";
import {ILQCRiskGuard} from "./interfaces/ILQCRiskGuard.sol";

/// @notice Fail-closed dual-source price validation for Router swap risk checks.
contract LQCOracleRiskGuard is ILQCRiskGuard {
    uint256 public constant BPS_DENOMINATOR = 10_000;
    uint256 public constant MIN_MAX_AGE = 1 minutes;
    uint256 public constant MAX_MAX_AGE = 1 days;

    struct AssetConfig {
        address primarySource;
        address secondarySource;
        uint128 pegPrice;
        uint32 maxAge;
        uint16 maxSourceDeviationBps;
        uint16 maxPegDeviationBps;
        bool enabled;
    }

    address public owner;
    address public pendingOwner;
    mapping(address => AssetConfig) public assetConfig;

    event AssetConfigChanged(address indexed token, address indexed primarySource, address indexed secondarySource,
        uint32 maxAge, uint16 maxSourceDeviationBps, uint128 pegPrice, uint16 maxPegDeviationBps, bool enabled);
    event OwnershipTransferStarted(address indexed currentOwner, address indexed pendingOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    error Forbidden();
    error ZeroAddress();
    error InvalidConfig();
    error AssetNotEnabled();
    error PriceUnavailable();
    error StalePrice();
    error SourceDeviationExceeded();
    error PegDeviationExceeded();

    modifier onlyOwner() {
        if (msg.sender != owner) revert Forbidden();
        _;
    }

    constructor(address owner_) {
        if (owner_ == address(0)) revert ZeroAddress();
        owner = owner_;
        emit OwnershipTransferred(address(0), owner_);
    }

    function setAssetConfig(address token, AssetConfig calldata config) external onlyOwner {
        if (token == address(0)) revert ZeroAddress();
        if (config.enabled) {
            if (config.primarySource == address(0) || config.secondarySource == address(0)
                || config.primarySource == config.secondarySource) revert InvalidConfig();
            if (config.maxAge < MIN_MAX_AGE || config.maxAge > MAX_MAX_AGE
                || config.maxSourceDeviationBps == 0 || config.maxSourceDeviationBps > 5_000) revert InvalidConfig();
            bool hasPeg = config.pegPrice != 0 || config.maxPegDeviationBps != 0;
            if (hasPeg && (config.pegPrice == 0 || config.maxPegDeviationBps == 0 || config.maxPegDeviationBps > 5_000)) {
                revert InvalidConfig();
            }
        }
        assetConfig[token] = config;
        emit AssetConfigChanged(token, config.primarySource, config.secondarySource, config.maxAge,
            config.maxSourceDeviationBps, config.pegPrice, config.maxPegDeviationBps, config.enabled);
    }

    function validateSwap(address tokenIn, address tokenOut) external view {
        _validateAsset(tokenIn);
        _validateAsset(tokenOut);
    }

    function validateAsset(address token) external view returns (uint256 primaryPrice, uint256 secondaryPrice) {
        return _validateAsset(token);
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

    function _validateAsset(address token) private view returns (uint256 primaryPrice, uint256 secondaryPrice) {
        AssetConfig memory config = assetConfig[token];
        if (!config.enabled) revert AssetNotEnabled();
        uint256 primaryUpdatedAt;
        uint256 secondaryUpdatedAt;
        try ILQCPriceSource(config.primarySource).latestPrice(token) returns (uint256 price, uint256 updatedAt) {
            primaryPrice = price;
            primaryUpdatedAt = updatedAt;
        } catch { revert PriceUnavailable(); }
        try ILQCPriceSource(config.secondarySource).latestPrice(token) returns (uint256 price, uint256 updatedAt) {
            secondaryPrice = price;
            secondaryUpdatedAt = updatedAt;
        } catch { revert PriceUnavailable(); }
        if (primaryPrice == 0 || secondaryPrice == 0 || primaryUpdatedAt > block.timestamp || secondaryUpdatedAt > block.timestamp) {
            revert PriceUnavailable();
        }
        if (block.timestamp - primaryUpdatedAt > config.maxAge || block.timestamp - secondaryUpdatedAt > config.maxAge) {
            revert StalePrice();
        }
        if (_deviationBps(primaryPrice, secondaryPrice) > config.maxSourceDeviationBps) {
            revert SourceDeviationExceeded();
        }
        if (config.pegPrice != 0 && (_deviationBps(primaryPrice, config.pegPrice) > config.maxPegDeviationBps
            || _deviationBps(secondaryPrice, config.pegPrice) > config.maxPegDeviationBps)) {
            revert PegDeviationExceeded();
        }
    }

    function _deviationBps(uint256 observed, uint256 referencePrice) private pure returns (uint256) {
        uint256 difference = observed > referencePrice ? observed - referencePrice : referencePrice - observed;
        uint256 denominator = observed < referencePrice ? observed : referencePrice;
        return difference * BPS_DENOMINATOR / denominator;
    }
}
