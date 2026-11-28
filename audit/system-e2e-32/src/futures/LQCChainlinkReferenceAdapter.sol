// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

interface IChainlinkReferenceFeed {
    function decimals() external view returns (uint8);

    function latestRoundData()
        external
        view
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound);
}

/// @notice Binds a Chainlink feed to the market and quote identifiers approved for a Wrapper.
/// @dev Quote denomination is an external approval decision. This adapter does not convert units
/// or alter the source round, price or timestamps.
contract LQCChainlinkReferenceAdapter {
    error InvalidConfiguration();

    IChainlinkReferenceFeed public immutable feed;
    address public immutable indexToken;
    address public immutable quoteToken;

    constructor(address feed_, address indexToken_, address quoteToken_) {
        if (feed_.code.length == 0 || indexToken_ == address(0) || quoteToken_ == address(0)
            || indexToken_ == quoteToken_) revert InvalidConfiguration();
        feed = IChainlinkReferenceFeed(feed_);
        indexToken = indexToken_;
        quoteToken = quoteToken_;
    }

    function decimals() external view returns (uint8) {
        return feed.decimals();
    }

    function latestRoundData()
        external
        view
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)
    {
        return feed.latestRoundData();
    }
}
