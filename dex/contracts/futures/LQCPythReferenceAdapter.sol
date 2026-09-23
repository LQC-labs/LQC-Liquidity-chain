// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IAggregatorV3} from "./interfaces/IAggregatorV3.sol";
import {IPyth} from "./interfaces/IPyth.sol";

/// @notice Chainlink-compatible read-only adapter for a Pyth price feed.
/// @dev Designed to be consumed as the independent referenceFeed of LQCAggregatorOracleAdapter.
contract LQCPythReferenceAdapter is IAggregatorV3 {
    uint8 public constant TARGET_DECIMALS = 18;
    uint16 public constant BPS = 10_000;
    uint16 public constant MAX_CONFIDENCE_BPS = 5_000;
    uint32 public constant MAX_AGE_LIMIT = 1 days;
    int32 public constant MIN_SUPPORTED_EXPO = -36;
    int32 public constant MAX_SUPPORTED_EXPO = 18;

    IPyth public immutable pyth;
    bytes32 public immutable priceId;
    uint32 public immutable maxAge;
    uint16 public immutable maxConfidenceBps;

    error InvalidAddress();
    error InvalidPriceId();
    error InvalidMaxAge();
    error InvalidConfidenceLimit();
    error InvalidPrice();
    error InvalidTimestamp();
    error UnsupportedExponent();
    error ExcessiveConfidence();
    error NormalizationUnderflow();

    constructor(address pyth_, bytes32 priceId_, uint32 maxAge_, uint16 maxConfidenceBps_) {
        if (pyth_ == address(0)) revert InvalidAddress();
        if (priceId_ == bytes32(0)) revert InvalidPriceId();
        if (maxAge_ == 0 || maxAge_ > MAX_AGE_LIMIT) revert InvalidMaxAge();
        if (maxConfidenceBps_ == 0 || maxConfidenceBps_ > MAX_CONFIDENCE_BPS) revert InvalidConfidenceLimit();

        pyth = IPyth(pyth_);
        priceId = priceId_;
        maxAge = maxAge_;
        maxConfidenceBps = maxConfidenceBps_;
    }

    function decimals() external pure returns (uint8) {
        return TARGET_DECIMALS;
    }

    function latestRoundData()
        external
        view
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        )
    {
        IPyth.Price memory p = pyth.getPriceNoOlderThan(priceId, maxAge);
        if (p.price <= 0) revert InvalidPrice();
        if (p.publishTime == 0 || p.publishTime > block.timestamp) revert InvalidTimestamp();
        if (p.expo < MIN_SUPPORTED_EXPO || p.expo > MAX_SUPPORTED_EXPO) revert UnsupportedExponent();

        uint256 unsignedPrice = uint256(uint64(p.price));
        if (uint256(p.conf) * BPS > unsignedPrice * maxConfidenceBps) revert ExcessiveConfidence();

        uint256 normalized = _normalizeTo18(unsignedPrice, p.expo);
        if (normalized == 0) revert NormalizationUnderflow();

        roundId = uint80(p.publishTime);
        answer = int256(normalized);
        startedAt = p.publishTime;
        updatedAt = p.publishTime;
        answeredInRound = roundId;
    }

    function _normalizeTo18(uint256 price, int32 expo) internal pure returns (uint256) {
        int256 scale = int256(expo) + int256(uint256(TARGET_DECIMALS));
        if (scale >= 0) {
            return price * (10 ** uint256(scale));
        }
        return price / (10 ** uint256(-scale));
    }
}
