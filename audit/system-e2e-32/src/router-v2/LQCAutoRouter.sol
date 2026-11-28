// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {SafeTransferLib} from "../libraries/SafeTransferLib.sol";
import {LQCSplitOptimizer} from "./LQCSplitOptimizer.sol";
import {LQCExecutionRouter} from "./LQCExecutionRouter.sol";

interface IERC20AutoBalance {
    function balanceOf(address account) external view returns (uint256);
}

/// @notice Converts an optimized quote into one protected atomic execution.
contract LQCAutoRouter {
    using SafeTransferLib for address;

    uint256 public constant BPS = 10_000;
    uint256 public constant MAX_SLIPPAGE_BPS = 2_000;
    LQCSplitOptimizer public immutable optimizer;
    LQCExecutionRouter public immutable executionRouter;
    uint256 private unlocked = 1;

    event OptimizedSwapExecuted(
        address indexed sender,
        address indexed recipient,
        address indexed tokenOut,
        uint256 amountIn,
        uint256 amountOut,
        uint256 routeCount,
        uint256 slippageBps
    );

    error ZeroAddress();
    error InvalidAmount();
    error InvalidSlippage();
    error UnsupportedToken();
    error Reentrancy();

    modifier nonReentrant() {
        if (unlocked != 1) revert Reentrancy();
        unlocked = 2;
        _;
        unlocked = 1;
    }

    constructor(address optimizer_, address executionRouter_) {
        if (optimizer_ == address(0) || executionRouter_ == address(0)) revert ZeroAddress();
        optimizer = LQCSplitOptimizer(optimizer_);
        executionRouter = LQCExecutionRouter(executionRouter_);
    }

    function swapOptimizedExactInput(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        address recipient,
        uint256 deadline,
        bytes[] calldata routeData,
        uint256[] calldata routeCostInTokenOut,
        uint256 parts,
        uint256 slippageBps
    ) external nonReentrant returns (uint256 amountOut) {
        if (amountIn == 0) revert InvalidAmount();
        if (recipient == address(0)) revert ZeroAddress();
        if (slippageBps > MAX_SLIPPAGE_BPS) revert InvalidSlippage();

        LQCSplitOptimizer.SplitQuote memory quote = optimizer.quoteOptimalSplitCapped(
            tokenIn, tokenOut, amountIn, routeData, routeCostInTokenOut, parts, 4
        );
        uint256 routeCount;
        for (uint256 i; i < quote.amountsIn.length; ++i) {
            if (quote.amountsIn[i] != 0) ++routeCount;
        }

        uint256 routerBefore = IERC20AutoBalance(tokenIn).balanceOf(address(this));
        tokenIn.safeTransferFrom(msg.sender, address(this), amountIn);
        if (IERC20AutoBalance(tokenIn).balanceOf(address(this)) - routerBefore != amountIn) {
            revert UnsupportedToken();
        }
        tokenIn.forceApprove(address(executionRouter), amountIn);

        if (routeCount == 1) {
            for (uint256 i; i < quote.amountsIn.length; ++i) {
                if (quote.amountsIn[i] == 0) continue;
                uint256 minimum = _minimum(quote.amountsOut[i], slippageBps);
                amountOut = executionRouter.swapExactInput(
                    quote.dexIds[i], tokenIn, tokenOut, amountIn, minimum, recipient, deadline, routeData[i]
                );
                break;
            }
        } else {
            LQCExecutionRouter.SplitRoute[] memory routes =
                new LQCExecutionRouter.SplitRoute[](routeCount);
            uint256 routeIndex;
            uint256 totalMinimum;
            for (uint256 i; i < quote.amountsIn.length; ++i) {
                if (quote.amountsIn[i] == 0) continue;
                uint256 minimum = _minimum(quote.amountsOut[i], slippageBps);
                routes[routeIndex++] = LQCExecutionRouter.SplitRoute({
                    dexId: quote.dexIds[i],
                    amountIn: quote.amountsIn[i],
                    amountOutMinimum: minimum,
                    routeData: routeData[i]
                });
                totalMinimum += minimum;
            }
            amountOut = executionRouter.swapSplitExactInput(
                tokenIn, tokenOut, amountIn, totalMinimum, recipient, deadline, routes
            );
        }

        tokenIn.forceApprove(address(executionRouter), 0);
        if (IERC20AutoBalance(tokenIn).balanceOf(address(this)) != routerBefore) revert UnsupportedToken();
        emit OptimizedSwapExecuted(
            msg.sender, recipient, tokenOut, amountIn, amountOut, routeCount, slippageBps
        );
    }

    function _minimum(uint256 quotedAmount, uint256 slippageBps) private pure returns (uint256) {
        uint256 minimum = quotedAmount * (BPS - slippageBps) / BPS;
        if (minimum == 0) revert InvalidAmount();
        return minimum;
    }
}
