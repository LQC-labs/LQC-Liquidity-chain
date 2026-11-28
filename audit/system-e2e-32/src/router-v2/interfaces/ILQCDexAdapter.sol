// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Common quote surface implemented by each approved external DEX adapter.
interface ILQCDexAdapter {
    function quoteExactInput(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        bytes calldata routeData
    ) external view returns (uint256 amountOut);
}
