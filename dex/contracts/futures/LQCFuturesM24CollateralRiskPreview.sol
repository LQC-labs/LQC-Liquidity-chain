// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IAggregatorV3} from "./interfaces/IAggregatorV3.sol";

/// @notice M24 isolated READ-ONLY collateral valuation preview.
/// @dev Pure risk research only: has no Engine or Vault authority. Caller-supplied
/// mark and entry price are NOT trusted Oracle bindings for operational use.
contract LQCFuturesM24CollateralRiskPreview {
    uint256 public constant USD18 = 1e18;
    uint256 public constant BPS = 10000;
    uint256 public constant MAX_FEED_AGE = 120 seconds;

    address public immutable primary;
    address public immutable referenceFeed;
    uint16 public immutable maxDeviationBps;

    error InvalidConfiguration();
    error InvalidCollateralQuote();
    error InvalidPosition();
    error UnsupportedDecimals();
    error ArithmeticOutOfRange();

    constructor(address primary_, address reference_, uint16 maxDeviationBps_) {
        if (primary_ == address(0) || reference_ == address(0) ||
            primary_ == reference_ || primary_.code.length == 0 || reference_.code.length == 0 ||
            maxDeviationBps_ == 0 || maxDeviationBps_ > 5000) revert InvalidConfiguration();
        primary = primary_;
        referenceFeed = reference_;
        maxDeviationBps = maxDeviationBps_;
    }

    /// @notice Lower independent quote, including prices BELOW M23's admission floor.
    /// @dev A depeg must NOT be treated as missing data during risk valuation.
    function collateralUsd18() public view returns (uint256) {
        uint256 a = _quote(primary);
        uint256 b = _quote(referenceFeed);
        uint256 delta = a > b ? a - b : b - a;
        if (delta > type(uint256).max / BPS ||
            b > type(uint256).max / uint256(maxDeviationBps)) revert InvalidCollateralQuote();
        if (delta * BPS > b * uint256(maxDeviationBps)) revert InvalidCollateralQuote();
        return a < b ? a : b;
    }

    /// @param marginUnits Actual locked collateral token base units (no account state mutation).
    /// @param decimals 6 or 18 only, assumed USD-pegged collateral (under a live quote).
    /// @param sizeUsd18 Position notional in canonical USD18.
    /// @param entryPrice18 Index entry price in USD18.
    /// @param markPrice18 Index mark price in USD18, supplied solely for offline simulation.
    /// @param isLong Direction of position.
    /// @param maintenanceBps Maintenance margin rate, 1..9999.
    /// @return equityUsd18 Conservative price-adjusted margin equity plus USD PnL.
    /// @return maintenanceUsd18 Required maintenance in USD18.
    /// @return liquidationEligible True if equity <= maintenance at the supplied prices.
    function preview(
        uint256 marginUnits,
        uint8 decimals,
        uint256 sizeUsd18,
        uint256 entryPrice18,
        uint256 markPrice18,
        bool isLong,
        uint16 maintenanceBps
    ) external view returns (int256 equityUsd18, uint256 maintenanceUsd18, bool liquidationEligible) {
        if (decimals != 6 && decimals != 18) revert UnsupportedDecimals();
        if (marginUnits == 0 || sizeUsd18 == 0 || entryPrice18 == 0 || markPrice18 == 0 ||
            maintenanceBps == 0 || maintenanceBps >= BPS) revert InvalidPosition();

        // Model bound for signed safe arithmetic. Non-representable or extreme inputs fail closed.
        uint256 scale = 10 ** (18 - decimals);
        if (marginUnits > uint256(type(int256).max) / scale ||
            sizeUsd18 > uint256(type(int256).max) / BPS ||
            sizeUsd18 > uint256(type(int256).max) / 2 ||
            entryPrice18 > uint256(type(int256).max) ||
            markPrice18 > uint256(type(int256).max)) revert ArithmeticOutOfRange();
        uint256 marginUsd18 = marginUnits * scale;
        uint256 quote = collateralUsd18();
        if (marginUsd18 > type(uint256).max / quote) revert ArithmeticOutOfRange();
        marginUsd18 = marginUsd18 * quote / USD18;
        if (marginUsd18 > uint256(type(int256).max)) revert ArithmeticOutOfRange();

        // Limit the price ratio before multiplication; use size * delta / entry for PnL.
        uint256 diff = markPrice18 > entryPrice18 ? markPrice18 - entryPrice18 : entryPrice18 - markPrice18;
        if (diff != 0 && sizeUsd18 > uint256(type(int256).max) / diff) revert ArithmeticOutOfRange();
        uint256 pnlAbs = sizeUsd18 * diff / entryPrice18;
        if (pnlAbs > uint256(type(int256).max)) revert ArithmeticOutOfRange();
        bool gain = isLong ? markPrice18 >= entryPrice18 : markPrice18 <= entryPrice18;
        int256 pnl = gain ? int256(pnlAbs) : -int256(pnlAbs);
        equityUsd18 = int256(marginUsd18) + pnl;
        maintenanceUsd18 = sizeUsd18 * uint256(maintenanceBps) / BPS;
        liquidationEligible = equityUsd18 <= int256(maintenanceUsd18);
    }

    function _quote(address feed) private view returns (uint256) {
        uint80 roundId;
        int256 answer;
        uint256 time;
        uint80 answeredInRound;
        try IAggregatorV3(feed).latestRoundData() returns
            (uint80 id, int256 result, uint256, uint256 updatedAt, uint80 answered) {
            roundId = id;
            answer = result;
            time = updatedAt;
            answeredInRound = answered;
        } catch { revert InvalidCollateralQuote(); }
        if (answer <= 0 || time == 0 || time > block.timestamp ||
            block.timestamp - time > MAX_FEED_AGE || answeredInRound < roundId)
            revert InvalidCollateralQuote();
        uint8 decimals;
        try IAggregatorV3(feed).decimals() returns (uint8 value) { decimals = value; }
        catch { revert InvalidCollateralQuote(); }
        if (decimals > 18) revert InvalidCollateralQuote();
        uint256 factor = 10 ** (18 - decimals);
        if (uint256(answer) > type(uint256).max / factor) revert InvalidCollateralQuote();
        return uint256(answer) * factor;
    }
}
