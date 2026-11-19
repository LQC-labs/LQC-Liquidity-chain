// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IVerifiedPythProPayloadReader} from "./LocalFuturesV2PythProBoundExitVerifier.sol";

/**
 * @notice Strict, independent reader for a narrowly configured Pyth Lazer EVM
 *         payload containing exactly TWO feeds and three properties per feed:
 *         Price (0), Exponent (4), FeedUpdateTimestamp (12).
 * @dev Does NOT verify Pyth signatures. It MUST be called only on the bytes
 *      RETURNED by the trusted on-chain Pyth Pro `verifyUpdate` contract.
 *      Not a full replacement for the maintained PythLazerLib SDK parser.
 *
 * Binary layout follows PythLazerLib.parsePayloadHeader/parseFeedHeader and
 * parseFeedValue* (network byte order, i.e. big endian). No raw `abi.decode`.
 */
contract LocalFuturesV2PythProBinaryPayloadReader is IVerifiedPythProPayloadReader {
    error Malformed();
    error FeedMismatch();
    error InvalidProperty();
    error InvalidPrice();
    error InvalidTimestamp();

    uint32 private constant MAGIC = 2479346549;
    uint256 private constant MAX_PRICE_18 = 1e24;
    uint8 private constant PRICE_PROPERTY = 0;
    uint8 private constant EXPONENT_PROPERTY = 4;
    uint8 private constant FEED_TIMESTAMP_PROPERTY = 12;
    uint16 private constant ALL_REQUIRED_PROPERTIES = (1 << 0) | (1 << 4) | (1 << 12);

    struct Feed {
        uint32 id;
        int64 mantissa;
        int16 exponent;
        uint64 timestampUs;
        uint16 propertyMask;
    }

    function readVerifiedPrices(bytes calldata payload, uint32 marketId, uint32 collateralId)
        external pure override returns (Prices memory result)
    {
        if (marketId == 0 || collateralId == 0 || marketId == collateralId) revert FeedMismatch();
        // With this deliberately narrow three-property/two-feed subscription,
        // the canonical payload is 68 bytes; keep an explicit size budget.
        if (payload.length < 14 || payload.length > 128) revert Malformed();
        if (_read(payload, 0, 4) != MAGIC) revert Malformed();
        uint64 timestampUs = uint64(_read(payload, 4, 8));
        if (timestampUs == 0) revert InvalidTimestamp();
        // Byte 12 is the Pyth channel (handled by the source contract/API).
        if (_read(payload, 13, 1) != 2) revert FeedMismatch();

        uint256 cursor = 14;
        Feed memory first;
        Feed memory second;
        (first, cursor) = _decodeFeed(payload, cursor, timestampUs);
        (second, cursor) = _decodeFeed(payload, cursor, timestampUs);
        if (cursor != payload.length) revert Malformed();

        if (!((first.id == marketId && second.id == collateralId) ||
              (first.id == collateralId && second.id == marketId))) revert FeedMismatch();

        Feed memory market = first.id == marketId ? first : second;
        Feed memory collateral = first.id == collateralId ? first : second;
        result = Prices({
            marketFeedId: marketId,
            collateralFeedId: collateralId,
            payloadTimestampUs: timestampUs,
            marketFeedTimestampUs: market.timestampUs,
            collateralFeedTimestampUs: collateral.timestampUs,
            marketPrice18: _scalePrice(market.mantissa, market.exponent),
            collateralPrice18: _scalePrice(collateral.mantissa, collateral.exponent)
        });
    }

    function _decodeFeed(bytes calldata payload, uint256 cursor, uint64 payloadTimestampUs)
        private pure returns (Feed memory feed, uint256 next)
    {
        feed.id = uint32(_read(payload, cursor, 4));
        cursor += 4;
        if (_read(payload, cursor, 1) != 3) revert InvalidProperty();
        cursor++;

        for (uint256 j = 0; j < 3; ++j) {
            uint8 propertyId = uint8(_read(payload, cursor, 1));
            cursor++;
            uint16 flag = uint16(1) << propertyId;
            if ((feed.propertyMask & flag) != 0) revert InvalidProperty();
            feed.propertyMask |= flag;

            if (propertyId == PRICE_PROPERTY) {
                feed.mantissa = int64(_read(payload, cursor, 8));
                cursor += 8;
            } else if (propertyId == EXPONENT_PROPERTY) {
                feed.exponent = int16(uint16(_read(payload, cursor, 2)));
                cursor += 2;
            } else if (propertyId == FEED_TIMESTAMP_PROPERTY) {
                if (_read(payload, cursor, 1) != 1) revert InvalidTimestamp();
                cursor++;
                feed.timestampUs = uint64(_read(payload, cursor, 8));
                cursor += 8;
            } else {
                // Any extra SDK property must be explicitly implemented and
                // re-reviewed; never attempt to guess its binary width.
                revert InvalidProperty();
            }
        }
        if (feed.propertyMask != ALL_REQUIRED_PROPERTIES) revert InvalidProperty();
        if (feed.timestampUs == 0 || feed.timestampUs > payloadTimestampUs) revert InvalidTimestamp();
        if (feed.mantissa <= 0) revert InvalidPrice();
        next = cursor;
    }

    function _scalePrice(int64 mantissa, int16 exponent) private pure returns (uint256 price18) {
        // Pyth mantissa * 10^exponent. Keep 18-decimal output exact: a
        // smaller exponent must divide without truncation or the input fails.
        if (exponent < -36 || exponent > 6) revert InvalidPrice();
        uint256 magnitude = uint256(uint64(mantissa)); // strictly positive above
        int256 shift = int256(exponent) + 18;
        if (shift >= 0) {
            price18 = magnitude * (10 ** uint256(shift));
        } else {
            uint256 divisor = 10 ** uint256(-shift);
            if (magnitude % divisor != 0) revert InvalidPrice();
            price18 = magnitude / divisor;
        }
        if (price18 == 0 || price18 > MAX_PRICE_18) revert InvalidPrice();
    }

    function _read(bytes calldata payload, uint256 cursor, uint256 width)
        private pure returns (uint64 value)
    {
        if (width == 0 || width > 8 || cursor > payload.length ||
            payload.length - cursor < width) revert Malformed();
        for (uint256 i = 0; i < width; ++i) {
            value = (value << 8) | uint8(payload[cursor + i]);
        }
    }
}
