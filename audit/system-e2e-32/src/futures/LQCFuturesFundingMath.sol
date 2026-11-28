// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Stateless arithmetic for the Engine funding checkpoint.
contract LQCFuturesFundingMath {
    uint256 private constant FUNDING_RAY = 1e27;
    error FundingOverflow();

    function quote(
        int256 previousRecognized,
        int256 previousRemainder,
        bool configured,
        int256 indexRay,
        int256 entry,
        uint256 sizeUsd,
        bool isLong
    ) external pure returns (int256 payment, int256 recognized, int256 remainder) {
        recognized = previousRecognized;
        remainder = previousRemainder;
        if (recognized == type(int256).min || remainder <= -int256(FUNDING_RAY) || remainder >= int256(FUNDING_RAY)) revert FundingOverflow();
        if (!configured) return (0, recognized, remainder);

        if (entry == type(int256).min) revert FundingOverflow();
        int256 deltaRay = _addFunding(indexRay, -entry);
        if (deltaRay == 0) return (0, recognized, remainder);
        if (deltaRay == type(int256).min) revert FundingOverflow();

        uint256 absDelta = uint256(deltaRay < 0 ? -deltaRay : deltaRay);
        if (sizeUsd != 0 && absDelta > type(uint256).max / sizeUsd) revert FundingOverflow();

        uint256 numerator = sizeUsd * absDelta;
        uint256 magnitude = numerator / FUNDING_RAY;
        if (magnitude > uint256(type(int256).max)) revert FundingOverflow();

        bool receives = (deltaRay > 0 && !isLong) || (deltaRay < 0 && isLong);
        int256 fraction = int256(numerator % FUNDING_RAY);
        remainder += receives ? fraction : -fraction;
        recognized = _addFunding(recognized, receives ? int256(magnitude) : -int256(magnitude));
        recognized = _addFunding(recognized, remainder / int256(FUNDING_RAY));
        remainder %= int256(FUNDING_RAY);
        // Normalize against lifetime accrual for this position, not just this call.
        if (recognized > 0 && remainder < 0) {
            recognized -= 1;
            remainder += int256(FUNDING_RAY);
        } else if (recognized < 0 && remainder > 0) {
            recognized += 1;
            remainder -= int256(FUNDING_RAY);
        }
        if (recognized == type(int256).min) revert FundingOverflow();
        payment = _addFunding(recognized, -previousRecognized);
        if (payment == type(int256).min) revert FundingOverflow();
    }

    /// @dev USD notional exposure is size / entry. A harmonic mean preserves exposure.
    /// Round against the trader, and reject fills that move existing PnL by more than one unit.
    function increasedEntry(uint256 oldSize, uint256 oldEntry, uint256 extra, uint256 fill, bool isLong)
        external pure returns (uint256 entry)
    {
        uint256 total = oldSize + extra;
        uint256 denominator = oldSize * fill + extra * oldEntry;
        uint256 numerator = total * oldEntry * fill;
        entry = numerator / denominator;
        if (isLong && numerator % denominator != 0) ++entry;
        if (entry == 0 || entry > uint256(type(int256).max) || total > uint256(type(int256).max)
            || oldEntry > uint256(type(int256).max) || fill > uint256(type(int256).max)) revert FundingOverflow();
        int256 original = (int256(fill) - int256(oldEntry)) * int256(oldSize) / int256(oldEntry);
        int256 combined = (int256(fill) - int256(entry)) * int256(total) / int256(entry);
        int256 difference = isLong ? original - combined : combined - original;
        if (difference < 0 || difference > 1) revert FundingOverflow();
    }

    function _addFunding(int256 a, int256 b) private pure returns (int256) {
        unchecked {
            int256 sum = a + b;
            if (b > 0 ? sum < a : sum > a) revert FundingOverflow();
            return sum;
        }
    }
    error InvalidAmount();
    error NotLiquidatable();

    /// @notice Calculates the original Engine liquidation result from a verified mark and Funding-adjusted margin.
    /// @dev Pure arithmetic. The Engine remains responsible for authorization, Oracle validation and all state changes.
    function liquidationQuote(uint256 size, uint256 entry, bool isLong, uint256 margin, uint256 price, uint256 maintenanceBps,
        uint256 reductionBps, uint256 minimumRemaining) external pure returns (uint256 reduction, bool full, int256 current, int256 pnl)
    {
        int256 difference = isLong ? int256(price) - int256(entry) : int256(entry) - int256(price);
        current = difference * int256(size) / int256(entry);
        int256 equity = int256(margin) + current;
        if (equity > int256(size * maintenanceBps / 10_000)) revert NotLiquidatable();
        reduction = size;
        if (reductionBps != 0) {
            if (size > type(uint256).max / reductionBps) revert InvalidAmount();
            uint256 proposed = size * reductionBps / 10_000;
            if (proposed != 0 && proposed < size && size - proposed >= minimumRemaining) reduction = proposed;
        }
        full = reduction == size || margin == 0;
        pnl = difference * int256(reduction) / int256(entry);
        if (!full && pnl < 0 && uint256(-pnl) >= margin) {
            full = true;
            reduction = size;
            pnl = current;
        }
    }
}
