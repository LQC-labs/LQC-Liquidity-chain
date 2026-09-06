// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ILQCExecutionAdapter} from "../interfaces/ILQCExecutionAdapter.sol";
import {SafeTransferLib} from "../../libraries/SafeTransferLib.sol";

interface ILQCFlowQuoteRouter {
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

/// @notice Quote adapter that exposes LQC Flow pools to Router 2.0.
contract LQCFlowAdapter is ILQCExecutionAdapter {
    using SafeTransferLib for address;
    ILQCFlowQuoteRouter public immutable flowRouter;

    error ZeroAddress();
    error InvalidRoute();
    error RouteEndpointMismatch();

    constructor(address flowRouter_) {
        if (flowRouter_ == address(0)) revert ZeroAddress();
        flowRouter = ILQCFlowQuoteRouter(flowRouter_);
    }

    /// @dev routeData is abi.encode(address[] path). It supports direct and multi-hop routes.
    function quoteExactInput(address tokenIn, address tokenOut, uint256 amountIn, bytes calldata routeData)
        external
        view
        override
        returns (uint256 amountOut)
    {
        address[] memory path = abi.decode(routeData, (address[]));
        if (path.length < 2) revert InvalidRoute();
        if (path[0] != tokenIn || path[path.length - 1] != tokenOut) revert RouteEndpointMismatch();
        uint256[] memory amounts = flowRouter.getAmountsOut(amountIn, path);
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
        tokenIn.forceApprove(address(flowRouter), amountIn);
        uint256[] memory amounts = flowRouter.swapExactTokensForTokens(
            amountIn, amountOutMinimum, path, recipient, deadline
        );
        tokenIn.forceApprove(address(flowRouter), 0);
        amountOut = amounts[amounts.length - 1];
    }
}
