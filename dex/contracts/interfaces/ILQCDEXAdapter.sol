// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface ILQCDEXAdapter {
    function quoteExactInput(address tokenIn, address tokenOut, uint256 amountIn, bytes calldata routeData)
        external
        view
        returns (uint256 amountOut);

    /// @dev The adapter pulls tokenIn from msg.sender and must send tokenOut to recipient.
    function swapExactInput(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOutMin,
        address recipient,
        bytes calldata routeData
    ) external returns (uint256 amountOut);
}
