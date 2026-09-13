// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ILQCExecutionAdapter} from "../router-v2/interfaces/ILQCExecutionAdapter.sol";

/// @notice Deterministic quote-only adapter for Router 2.0 tests; never deploy to a live network.
contract MockRouterV2DexAdapter is ILQCExecutionAdapter {
    uint256 public rateNumerator;
    uint256 public rateDenominator;
    bool public quoteFailure;

    error InvalidRate();
    error QuoteFailure();
    error NotExecutable();

    constructor(uint256 rateNumerator_, uint256 rateDenominator_) {
        if (rateNumerator_ == 0 || rateDenominator_ == 0) revert InvalidRate();
        rateNumerator = rateNumerator_;
        rateDenominator = rateDenominator_;
    }

    function setRate(uint256 rateNumerator_, uint256 rateDenominator_) external {
        if (rateNumerator_ == 0 || rateDenominator_ == 0) revert InvalidRate();
        rateNumerator = rateNumerator_;
        rateDenominator = rateDenominator_;
    }

    function setQuoteFailure(bool value) external {
        quoteFailure = value;
    }

    function quoteExactInput(address, address, uint256 amountIn, bytes calldata)
        external view returns (uint256 amountOut)
    {
        if (quoteFailure) revert QuoteFailure();
        amountOut = amountIn * rateNumerator / rateDenominator;
    }

    function supportsExecution() external pure returns (bool) {
        return false;
    }

    function executeExactInput(address, address, uint256, uint256, address, uint256, bytes calldata)
        external pure returns (uint256)
    {
        revert NotExecutable();
    }
}
