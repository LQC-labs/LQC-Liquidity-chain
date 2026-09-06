// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ILQCExecutionAdapter} from "../interfaces/ILQCExecutionAdapter.sol";
import {SafeTransferLib} from "../../libraries/SafeTransferLib.sol";

interface IPancakeV2Router {
    function getAmountsOut(uint256 amountIn, address[] calldata path)
        external
        view
        returns (uint256[] memory amounts);

    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external returns (uint256[] memory amounts);
}

/// @notice Quote-only adapter for PancakeSwap V2-compatible routers.
contract PancakeV2Adapter is ILQCExecutionAdapter {
    using SafeTransferLib for address;
    IPancakeV2Router public immutable pancakeRouter;

    error ZeroAddress();
    error InvalidRoute();
    error RouteEndpointMismatch();

    constructor(address pancakeRouter_) {
        if (pancakeRouter_ == address(0)) revert ZeroAddress();
        pancakeRouter = IPancakeV2Router(pancakeRouter_);
    }

    /// @dev routeData is abi.encode(address[] path). Native BNB execution is intentionally deferred.
    function quoteExactInput(address tokenIn, address tokenOut, uint256 amountIn, bytes calldata routeData)
        external
        view
        override
        returns (uint256 amountOut)
    {
        address[] memory path = abi.decode(routeData, (address[]));
        if (path.length < 2) revert InvalidRoute();
        if (path[0] != tokenIn || path[path.length - 1] != tokenOut) revert RouteEndpointMismatch();

        uint256[] memory amounts = pancakeRouter.getAmountsOut(amountIn, path);
        amountOut = amounts[amounts.length - 1];
    }

    function executeExactInput(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOutMinimum,
        address recipient,
        uint256 deadline,
        bytes calldata routeData
    ) external override returns (uint256 amountOut) {
        address[] memory path = abi.decode(routeData, (address[]));
        if (path.length < 2) revert InvalidRoute();
        if (path[0] != tokenIn || path[path.length - 1] != tokenOut) revert RouteEndpointMismatch();
        tokenIn.safeTransferFrom(msg.sender, address(this), amountIn);
        tokenIn.forceApprove(address(pancakeRouter), amountIn);
        uint256[] memory amounts = pancakeRouter.swapExactTokensForTokens(
            amountIn, amountOutMinimum, path, recipient, deadline
        );
        tokenIn.forceApprove(address(pancakeRouter), 0);
        amountOut = amounts[amounts.length - 1];
    }
}
