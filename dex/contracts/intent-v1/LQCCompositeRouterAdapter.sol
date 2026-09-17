// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {SafeTransferLib} from "../libraries/SafeTransferLib.sol";

interface IERC20CompositeRouterBalance {
    function balanceOf(address account) external view returns (uint256);
}

interface ILQCExecutionRouterComposite {
    function swapExactInput(
        bytes32 dexId,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOutMinimum,
        address recipient,
        uint256 deadline,
        bytes calldata routeData
    ) external returns (uint256 amountOut);
}

/// @notice Reviewed Composite Action adapter for one exact Router 2.0 deployment.
/// @dev data = abi.encode(bytes32 dexId, uint256 deadline, bytes routeData).
contract LQCCompositeRouterAdapter {
    using SafeTransferLib for address;

    address public immutable executor;
    address public immutable executionRouter;

    error Unauthorized();
    error InvalidAction();
    error BalanceMismatch();

    constructor(address executor_, address executionRouter_) {
        if (executor_ == address(0) || executionRouter_ == address(0) || executionRouter_.code.length == 0) {
            revert InvalidAction();
        }
        executor = executor_;
        executionRouter = executionRouter_;
    }

    function execute(address tokenIn, address tokenOut, uint256 amountIn, uint256 minAmountOut, bytes calldata data)
        external
        returns (uint256 amountOut)
    {
        if (msg.sender != executor) revert Unauthorized();
        if (
            tokenIn == address(0) || tokenOut == address(0) || tokenIn == tokenOut || amountIn == 0
                || minAmountOut == 0 || data.length == 0
        ) revert InvalidAction();
        (bytes32 dexId, uint256 deadline, bytes memory routeData) = abi.decode(data, (bytes32, uint256, bytes));
        if (dexId == bytes32(0) || deadline < block.timestamp || routeData.length == 0) revert InvalidAction();

        tokenIn.safeTransferFrom(executor, address(this), amountIn);
        if (IERC20CompositeRouterBalance(tokenIn).balanceOf(address(this)) != amountIn) revert BalanceMismatch();
        uint256 outputBefore = IERC20CompositeRouterBalance(tokenOut).balanceOf(executor);
        tokenIn.forceApprove(executionRouter, amountIn);
        uint256 reported = ILQCExecutionRouterComposite(executionRouter).swapExactInput(
            dexId, tokenIn, tokenOut, amountIn, minAmountOut, executor, deadline, routeData
        );
        tokenIn.forceApprove(executionRouter, 0);
        amountOut = IERC20CompositeRouterBalance(tokenOut).balanceOf(executor) - outputBefore;
        if (amountOut != reported || amountOut < minAmountOut) revert BalanceMismatch();
        if (IERC20CompositeRouterBalance(tokenIn).balanceOf(address(this)) != 0) revert BalanceMismatch();
    }
}
