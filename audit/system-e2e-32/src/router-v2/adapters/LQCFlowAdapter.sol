// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ILQCExecutionAdapter} from "../interfaces/ILQCExecutionAdapter.sol";
import {SafeTransferLib} from "../../libraries/SafeTransferLib.sol";
import {IERC20} from "../../interfaces/IERC20.sol";

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
    error InvalidEndpoint();
    error InvalidRoute();
    error RepeatedPool();
    error RouteEndpointMismatch();
    error UnsupportedTokenBehavior();

    constructor(address flowRouter_) {
        if (flowRouter_ == address(0)) revert ZeroAddress();
        if (flowRouter_.code.length == 0) revert InvalidEndpoint();
        flowRouter = ILQCFlowQuoteRouter(flowRouter_);
    }

    function supportsExecution() external pure override returns (bool) {
        return true;
    }

    /// @dev routeData is abi.encode(address[] path). It supports direct and multi-hop routes.
    function quoteExactInput(address tokenIn, address tokenOut, uint256 amountIn, bytes calldata routeData)
        external
        view
        override
        returns (uint256 amountOut)
    {
        address[] memory path = _validatedPath(tokenIn, tokenOut, routeData);
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
        address[] memory path = _validatedPath(tokenIn, tokenOut, routeData);
        uint256 adapterBefore = IERC20(tokenIn).balanceOf(address(this));
        tokenIn.safeTransferFrom(msg.sender, address(this), amountIn);
        if (IERC20(tokenIn).balanceOf(address(this)) - adapterBefore != amountIn) {
            revert UnsupportedTokenBehavior();
        }
        tokenIn.forceApprove(address(flowRouter), amountIn);
        uint256[] memory amounts = flowRouter.swapExactTokensForTokens(
            amountIn, amountOutMinimum, path, recipient, deadline
        );
        tokenIn.forceApprove(address(flowRouter), 0);
        if (IERC20(tokenIn).balanceOf(address(this)) != adapterBefore) {
            revert UnsupportedTokenBehavior();
        }
        amountOut = amounts[amounts.length - 1];
    }

    function _validatedPath(address tokenIn, address tokenOut, bytes calldata routeData)
        private pure returns (address[] memory path)
    {
        path = abi.decode(routeData, (address[]));
        if (path.length < 2) revert InvalidRoute();
        if (path[0] != tokenIn || path[path.length - 1] != tokenOut) revert RouteEndpointMismatch();

        // Quotes use pre-swap reserves for each hop. Reusing a pool would price a later hop against stale reserves.
        for (uint256 i; i + 1 < path.length; ++i) {
            address from = path[i];
            address to = path[i + 1];
            if (from == address(0) || to == address(0) || from == to) revert InvalidRoute();
            for (uint256 j; j < i; ++j) {
                if ((path[j] == from && path[j + 1] == to) || (path[j] == to && path[j + 1] == from)) {
                    revert RepeatedPool();
                }
            }
        }
    }
}
