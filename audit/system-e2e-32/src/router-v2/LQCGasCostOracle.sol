// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ILQCPriceFeed} from "./interfaces/ILQCPriceFeed.sol";

/// @notice Converts native-chain gas cost into output-token units using two validated USD feeds.
/// @dev Primary and secondary feeds must use the same economic quote (normally USD).
contract LQCGasCostOracle {
    uint256 public constant BPS = 10_000;
    uint256 public constant MAX_DEVIATION_BPS = 2_000;
    uint256 public constant MAX_FEED_DECIMALS = 18;

    struct FeedConfig {
        address primary;
        address secondary;
        uint32 maxAge;
        uint16 maxDeviationBps;
        uint8 tokenDecimals;
        bool enabled;
    }

    address public owner;
    address public pendingOwner;
    address public immutable wrappedNative;
    mapping(address => FeedConfig) public feedConfigs;

    event FeedConfigured(address indexed token, address indexed primary, address indexed secondary);
    event FeedStatusChanged(address indexed token, bool enabled);
    event OwnershipTransferStarted(address indexed owner, address indexed pendingOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    error Forbidden();
    error ZeroAddress();
    error InvalidConfig();
    error FeedDisabled();
    error InvalidPrice();
    error StalePrice();
    error ExcessiveDeviation();

    modifier onlyOwner() {
        if (msg.sender != owner) revert Forbidden();
        _;
    }

    constructor(address owner_, address wrappedNative_) {
        if (owner_ == address(0) || wrappedNative_ == address(0)) revert ZeroAddress();
        owner = owner_;
        wrappedNative = wrappedNative_;
        emit OwnershipTransferred(address(0), owner_);
    }

    function configureFeed(
        address token,
        address primary,
        address secondary,
        uint32 maxAge,
        uint16 maxDeviationBps,
        uint8 tokenDecimals
    ) external onlyOwner {
        if (token == address(0) || primary == address(0) || secondary == address(0)) revert ZeroAddress();
        if (maxAge == 0 || maxDeviationBps > MAX_DEVIATION_BPS || tokenDecimals > 18) revert InvalidConfig();
        if (ILQCPriceFeed(primary).decimals() > MAX_FEED_DECIMALS) revert InvalidConfig();
        if (ILQCPriceFeed(secondary).decimals() > MAX_FEED_DECIMALS) revert InvalidConfig();
        feedConfigs[token] = FeedConfig(primary, secondary, maxAge, maxDeviationBps, tokenDecimals, true);
        emit FeedConfigured(token, primary, secondary);
    }

    function setFeedEnabled(address token, bool enabled) external onlyOwner {
        if (feedConfigs[token].primary == address(0)) revert InvalidConfig();
        feedConfigs[token].enabled = enabled;
        emit FeedStatusChanged(token, enabled);
    }

    function quoteGasCost(address tokenOut, uint256 gasUnits, uint256 gasPriceWei)
        public view returns (uint256 tokenCost)
    {
        uint256 nativePrice = _validatedPrice(wrappedNative);
        uint256 tokenPrice = _validatedPrice(tokenOut);
        uint8 tokenDecimals = feedConfigs[tokenOut].tokenDecimals;
        uint256 nativeCostWei = gasUnits * gasPriceWei;
        tokenCost = nativeCostWei * nativePrice * (10 ** tokenDecimals) / 1e18 / tokenPrice;
    }

    function quoteRouteCosts(address tokenOut, uint256[] calldata gasUnits, uint256 gasPriceWei)
        external view returns (uint256[] memory costs)
    {
        costs = new uint256[](gasUnits.length);
        for (uint256 i; i < gasUnits.length; ++i) costs[i] = quoteGasCost(tokenOut, gasUnits[i], gasPriceWei);
    }

    function _validatedPrice(address token) private view returns (uint256 primaryPrice) {
        FeedConfig memory config = feedConfigs[token];
        if (!config.enabled) revert FeedDisabled();
        primaryPrice = _read(config.primary, config.maxAge);
        uint256 secondaryPrice = _read(config.secondary, config.maxAge);
        uint256 lower = primaryPrice < secondaryPrice ? primaryPrice : secondaryPrice;
        uint256 difference = primaryPrice > secondaryPrice
            ? primaryPrice - secondaryPrice
            : secondaryPrice - primaryPrice;
        if (difference * BPS > lower * config.maxDeviationBps) revert ExcessiveDeviation();
    }

    function _read(address feed, uint32 maxAge) private view returns (uint256 normalizedPrice) {
        (, int256 answer,, uint256 updatedAt,) = ILQCPriceFeed(feed).latestRoundData();
        if (answer <= 0 || updatedAt == 0 || updatedAt > block.timestamp) revert InvalidPrice();
        if (block.timestamp - updatedAt > maxAge) revert StalePrice();
        uint8 decimals = ILQCPriceFeed(feed).decimals();
        normalizedPrice = uint256(answer) * (10 ** (18 - decimals));
    }

    function beginOwnershipTransfer(address newOwner) external onlyOwner {
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
}
