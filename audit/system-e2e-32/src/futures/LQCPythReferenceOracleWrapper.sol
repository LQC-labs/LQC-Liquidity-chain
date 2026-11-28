// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {ILQCFuturesOracle} from "./ILQCFuturesOracle.sol";

interface IMarketBoundPriceCache is ILQCFuturesOracle {
    function indexToken() external view returns (address);
}

interface IMarketBoundReferenceFeed {
    function indexToken() external view returns (address);
    function quoteToken() external view returns (address);
    function decimals() external view returns (uint8);
    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80);
}

/// @notice Compares a USD-denominated Pyth cache with an independently selected reference.
/// @dev Governance must establish reference independence and the quote asset's USD equivalence.
contract LQCPythReferenceOracleWrapper is ILQCFuturesOracle {
    error InvalidConfiguration();
    error WrongMarket();
    error SourceCodeChanged();
    error WrongPair();
    error UnsupportedReferenceUnit();
    error InvalidPrice();
    error InvalidReferenceRound();
    error InvalidTimestamp();
    error ExcessiveDeviation();

    uint256 private constant BPS = 10_000;
    uint8 private constant PRICE_DECIMALS = 18;
    uint8 private constant MAX_REFERENCE_DECIMALS = 36;
    uint32 private constant MAX_AGE = 120 seconds;

    struct Policy {
        uint32 cacheMaxAge;
        uint32 referenceMaxAge;
        uint16 maxDeviationBps;
        uint8 referenceDecimals;
        uint256 configVersion;
    }

    IMarketBoundPriceCache public immutable cache;
    IMarketBoundReferenceFeed public immutable referenceFeed;
    address public immutable indexToken;
    address public immutable quoteToken;
    bytes32 public immutable cacheCodeHash;
    bytes32 public immutable referenceCodeHash;
    uint32 public immutable cacheMaxAge;
    uint32 public immutable referenceMaxAge;
    uint16 public immutable maxDeviationBps;
    uint8 public immutable referenceDecimals;
    uint256 public immutable configVersion;
    bytes32 public immutable configHash;

    constructor(address cache_, address reference_, address market_, address quote_, Policy memory policy) {
        if (
            cache_.code.length == 0 || reference_.code.length == 0 || cache_ == reference_
                || market_ == address(0) || quote_ == address(0) || market_ == quote_
                || policy.cacheMaxAge == 0 || policy.cacheMaxAge > MAX_AGE
                || policy.referenceMaxAge == 0 || policy.referenceMaxAge > MAX_AGE
                || policy.maxDeviationBps == 0 || policy.maxDeviationBps > BPS || policy.configVersion == 0
        ) revert InvalidConfiguration();
        if (policy.referenceDecimals > MAX_REFERENCE_DECIMALS) revert UnsupportedReferenceUnit();

        cache = IMarketBoundPriceCache(cache_);
        referenceFeed = IMarketBoundReferenceFeed(reference_);
        indexToken = market_;
        quoteToken = quote_;
        cacheCodeHash = cache_.codehash;
        referenceCodeHash = reference_.codehash;
        cacheMaxAge = policy.cacheMaxAge;
        referenceMaxAge = policy.referenceMaxAge;
        maxDeviationBps = policy.maxDeviationBps;
        referenceDecimals = policy.referenceDecimals;
        configVersion = policy.configVersion;
        configHash = keccak256(abi.encode(cache_, reference_, market_, quote_, cacheCodeHash, referenceCodeHash, policy));
        _checkSources();
    }

    function getPrice(address requestedToken) external view virtual returns (uint256 price, uint256 updatedAt) {
        (price,, updatedAt) = _validatedPrices(requestedToken);
    }

    function _validatedPrices(address requestedToken)
        internal view returns (uint256 price, uint256 referencePrice, uint256 updatedAt)
    {
        if (requestedToken != indexToken) revert WrongMarket();
        _checkSources();
        (price, updatedAt) = cache.getPrice(requestedToken);
        if (price == 0) revert InvalidPrice();
        _checkTimestamp(updatedAt, cacheMaxAge);

        (uint80 roundId, int256 answer,, uint256 referenceAt, uint80 answeredInRound) =
            referenceFeed.latestRoundData();
        if (roundId == 0 || answeredInRound < roundId) revert InvalidReferenceRound();
        if (answer <= 0) revert InvalidPrice();
        _checkTimestamp(referenceAt, referenceMaxAge);
        referencePrice = _scaleReference(uint256(answer));
        uint256 difference = price > referencePrice ? price - referencePrice : referencePrice - price;
        // Split before multiplication to compute floor(referencePrice * bps / BPS) without overflow.
        uint256 limit = (referencePrice / BPS) * maxDeviationBps + (referencePrice % BPS) * maxDeviationBps / BPS;
        if (difference > limit) revert ExcessiveDeviation();
        if (referenceAt < updatedAt) updatedAt = referenceAt;
    }

    function _checkSources() private view {
        if (address(cache).codehash != cacheCodeHash || address(referenceFeed).codehash != referenceCodeHash) {
            revert SourceCodeChanged();
        }
        if (cache.indexToken() != indexToken || referenceFeed.indexToken() != indexToken
            || referenceFeed.quoteToken() != quoteToken) revert WrongPair();
        if (referenceFeed.decimals() != referenceDecimals) revert UnsupportedReferenceUnit();
    }

    function _checkTimestamp(uint256 timestamp, uint256 maxAge) private view {
        if (timestamp == 0 || timestamp > block.timestamp || block.timestamp - timestamp > maxAge) {
            revert InvalidTimestamp();
        }
    }

    function _scaleReference(uint256 answer) private view returns (uint256) {
        if (referenceDecimals <= PRICE_DECIMALS) {
            uint256 factor = 10 ** uint256(PRICE_DECIMALS - referenceDecimals);
            if (answer > type(uint256).max / factor) revert InvalidPrice();
            return answer * factor;
        }
        uint256 divisor = 10 ** uint256(referenceDecimals - PRICE_DECIMALS);
        if (answer % divisor != 0) revert UnsupportedReferenceUnit();
        return answer / divisor;
    }
}
