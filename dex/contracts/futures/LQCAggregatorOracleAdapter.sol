// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ILQCFuturesOracle} from "./ILQCFuturesOracle.sol";
import {IAggregatorV3} from "./interfaces/IAggregatorV3.sol";

/// @notice Chainlink-compatible price-feed adapter for LQC Flow Futures.
/// @dev Normalizes feeds to 1e18 and can compare a primary feed against an independent reference feed.
contract LQCAggregatorOracleAdapter is ILQCFuturesOracle {
    uint256 public constant BPS = 10_000;
    uint8 public constant TARGET_DECIMALS = 18;
    uint8 public constant MAX_FEED_DECIMALS = 36;
    uint256 public constant MAX_HEARTBEAT = 1 days;
    uint16 public constant MAX_DEVIATION_BPS = 5_000;

    struct FeedConfig {
        address feed;
        uint32 heartbeat;
        address referenceFeed;
        uint16 maxDeviationBps;
    }

    address public owner;
    address public pendingOwner;
    mapping(address => FeedConfig) public feedConfigs;

    event FeedConfigured(address indexed indexToken, address indexed feed, uint32 heartbeat);
    event CircuitBreakerConfigured(address indexed indexToken, address indexed referenceFeed, uint16 maxDeviationBps);
    event CircuitBreakerCleared(address indexed indexToken);
    event OwnershipTransferStarted(address indexed currentOwner, address indexed pendingOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    error Forbidden();
    error InvalidAddress();
    error InvalidHeartbeat();
    error InvalidDeviation();
    error FeedNotConfigured();
    error InvalidFeedAnswer();
    error InvalidFeedTimestamp();
    error StaleFeedPrice();
    error InvalidFeedRound();
    error UnsupportedFeedDecimals();
    error ExcessivePriceDeviation();

    modifier onlyOwner() {
        if (msg.sender != owner) revert Forbidden();
        _;
    }

    constructor(address owner_) {
        if (owner_ == address(0)) revert InvalidAddress();
        owner = owner_;
        emit OwnershipTransferred(address(0), owner_);
    }

    function setFeed(address indexToken, address feed, uint32 heartbeat) external onlyOwner {
        if (indexToken == address(0) || feed == address(0)) revert InvalidAddress();
        if (heartbeat == 0 || heartbeat > MAX_HEARTBEAT) revert InvalidHeartbeat();

        FeedConfig storage config = feedConfigs[indexToken];
        bool clearCircuitBreaker =
            config.referenceFeed != address(0) && (config.feed != feed || config.heartbeat != heartbeat);
        config.feed = feed;
        config.heartbeat = heartbeat;
        if (clearCircuitBreaker) {
            config.referenceFeed = address(0);
            config.maxDeviationBps = 0;
            emit CircuitBreakerCleared(indexToken);
        }
        emit FeedConfigured(indexToken, feed, heartbeat);
    }

    function setCircuitBreaker(address indexToken, address referenceFeed, uint16 maxDeviationBps)
        external
        onlyOwner
    {
        FeedConfig storage config = feedConfigs[indexToken];
        if (config.feed == address(0)) revert FeedNotConfigured();
        if (referenceFeed == address(0) || referenceFeed == config.feed) revert InvalidAddress();
        if (maxDeviationBps == 0 || maxDeviationBps > MAX_DEVIATION_BPS) revert InvalidDeviation();
        config.referenceFeed = referenceFeed;
        config.maxDeviationBps = maxDeviationBps;
        emit CircuitBreakerConfigured(indexToken, referenceFeed, maxDeviationBps);
    }

    function clearCircuitBreaker(address indexToken) external onlyOwner {
        FeedConfig storage config = feedConfigs[indexToken];
        if (config.feed == address(0)) revert FeedNotConfigured();
        config.referenceFeed = address(0);
        config.maxDeviationBps = 0;
        emit CircuitBreakerCleared(indexToken);
    }

    function feeds(address indexToken) external view returns (address) {
        return feedConfigs[indexToken].feed;
    }

    function getPrice(address indexToken) external view returns (uint256 price, uint256 updatedAt) {
        FeedConfig memory config = feedConfigs[indexToken];
        if (config.feed == address(0)) revert FeedNotConfigured();

        (price, updatedAt) = _readFeed(config.feed, config.heartbeat);
        if (config.referenceFeed != address(0)) {
            (uint256 referencePrice,) = _readFeed(config.referenceFeed, config.heartbeat);
            uint256 difference = price > referencePrice ? price - referencePrice : referencePrice - price;
            if (difference > (referencePrice * config.maxDeviationBps) / BPS) revert ExcessivePriceDeviation();
        }
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert InvalidAddress();
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

    function _readFeed(address feed, uint32 heartbeat) private view returns (uint256 price, uint256 updatedAt) {
        IAggregatorV3 aggregator = IAggregatorV3(feed);
        (uint80 roundId, int256 answer,, uint256 sourceUpdatedAt, uint80 answeredInRound) =
            aggregator.latestRoundData();
        if (answer <= 0) revert InvalidFeedAnswer();
        if (sourceUpdatedAt == 0 || sourceUpdatedAt > block.timestamp) revert InvalidFeedTimestamp();
        if (block.timestamp - sourceUpdatedAt > heartbeat) revert StaleFeedPrice();
        if (answeredInRound < roundId) revert InvalidFeedRound();

        uint8 feedDecimals = aggregator.decimals();
        if (feedDecimals > MAX_FEED_DECIMALS) revert UnsupportedFeedDecimals();

        uint256 unsignedAnswer = uint256(answer);
        if (feedDecimals == TARGET_DECIMALS) price = unsignedAnswer;
        else if (feedDecimals < TARGET_DECIMALS) {
            price = unsignedAnswer * (10 ** uint256(TARGET_DECIMALS - feedDecimals));
        } else {
            price = unsignedAnswer / (10 ** uint256(feedDecimals - TARGET_DECIMALS));
        }
        if (price == 0) revert InvalidFeedAnswer();
        updatedAt = sourceUpdatedAt;
    }
}
