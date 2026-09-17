// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ILQCFuturesOracle} from "./ILQCFuturesOracle.sol";
import {IAggregatorV3} from "./interfaces/IAggregatorV3.sol";

/// @notice Chainlink-compatible price-feed adapter for LQC Flow Futures.
/// @dev Normalizes positive feed answers to the 1e18 price scale expected by ILQCFuturesOracle.
contract LQCAggregatorOracleAdapter is ILQCFuturesOracle {
    uint8 public constant TARGET_DECIMALS = 18;
    uint8 public constant MAX_FEED_DECIMALS = 36;
    uint256 public constant MAX_HEARTBEAT = 1 days;

    struct FeedConfig {
        address feed;
        uint32 heartbeat;
    }

    address public immutable owner;
    mapping(address => FeedConfig) public feedConfigs;

    event FeedConfigured(address indexed indexToken, address indexed feed, uint32 heartbeat);

    error NotOwner();
    error InvalidAddress();
    error InvalidHeartbeat();
    error FeedNotConfigured();
    error InvalidFeedAnswer();
    error InvalidFeedTimestamp();
    error StaleFeedPrice();
    error InvalidFeedRound();
    error UnsupportedFeedDecimals();

    constructor(address owner_) {
        if (owner_ == address(0)) revert InvalidAddress();
        owner = owner_;
    }

    function setFeed(address indexToken, address feed, uint32 heartbeat) external {
        if (msg.sender != owner) revert NotOwner();
        if (indexToken == address(0) || feed == address(0)) revert InvalidAddress();
        if (heartbeat == 0 || heartbeat > MAX_HEARTBEAT) revert InvalidHeartbeat();
        feedConfigs[indexToken] = FeedConfig({feed: feed, heartbeat: heartbeat});
        emit FeedConfigured(indexToken, feed, heartbeat);
    }

    function feeds(address indexToken) external view returns (address) {
        return feedConfigs[indexToken].feed;
    }

    function getPrice(address indexToken) external view returns (uint256 price, uint256 updatedAt) {
        FeedConfig memory config = feedConfigs[indexToken];
        if (config.feed == address(0)) revert FeedNotConfigured();

        IAggregatorV3 aggregator = IAggregatorV3(config.feed);
        (uint80 roundId, int256 answer,, uint256 sourceUpdatedAt, uint80 answeredInRound) = aggregator.latestRoundData();
        if (answer <= 0) revert InvalidFeedAnswer();
        if (sourceUpdatedAt == 0 || sourceUpdatedAt > block.timestamp) revert InvalidFeedTimestamp();
        if (block.timestamp - sourceUpdatedAt > config.heartbeat) revert StaleFeedPrice();
        if (answeredInRound < roundId) revert InvalidFeedRound();

        uint8 feedDecimals = aggregator.decimals();
        if (feedDecimals > MAX_FEED_DECIMALS) revert UnsupportedFeedDecimals();

        uint256 unsignedAnswer = uint256(answer);
        if (feedDecimals == TARGET_DECIMALS) price = unsignedAnswer;
        else if (feedDecimals < TARGET_DECIMALS) price = unsignedAnswer * (10 ** uint256(TARGET_DECIMALS - feedDecimals));
        else price = unsignedAnswer / (10 ** uint256(feedDecimals - TARGET_DECIMALS));

        if (price == 0) revert InvalidFeedAnswer();
        updatedAt = sourceUpdatedAt;
    }
}
