// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ILQCDexRegistry} from "./interfaces/ILQCDexRegistry.sol";
import {ILQCDexAdapter} from "./interfaces/ILQCDexAdapter.sol";
import {ILQCExecutionAdapter} from "./interfaces/ILQCExecutionAdapter.sol";

/// @notice Read-only optimizer that approximates the best allocation across registered DEXs.
/// @dev Intended for eth_call/off-chain use. More parts improve price-impact precision but increase calls.
contract LQCSplitOptimizer {
    uint256 public constant MAX_PARTS = 20;
    ILQCDexRegistry public immutable registry;

    struct SplitQuote {
        bytes32[] dexIds;
        address[] adapters;
        uint256[] amountsIn;
        uint256[] amountsOut;
        uint256 totalAmountOut;
        uint256 totalNetAmountOut;
    }

    error ZeroAddress();
    error InvalidTokens();
    error InvalidAmount();
    error InvalidParts();
    error InvalidRouteData();
    error NoExecutableRoute();
    error InvalidMaxRoutes();

    constructor(address registry_) {
        if (registry_ == address(0)) revert ZeroAddress();
        registry = ILQCDexRegistry(registry_);
    }

    /// @param routeData Adapter-specific route bytes aligned with current registry order.
    /// @param routeCostInTokenOut Estimated one-time execution cost per route, denominated in tokenOut.
    /// @param parts Number of incremental allocation slices, from 2 through 20.
    function quoteOptimalSplit(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        bytes[] calldata routeData,
        uint256[] calldata routeCostInTokenOut,
        uint256 parts
    ) external view returns (SplitQuote memory result) {
        return _quoteOptimalSplit(
            tokenIn, tokenOut, amountIn, routeData, routeCostInTokenOut, parts, registry.dexCount()
        );
    }

    /// @notice Same optimizer with a cap on distinct routes for bounded execution.
    function quoteOptimalSplitCapped(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        bytes[] calldata routeData,
        uint256[] calldata routeCostInTokenOut,
        uint256 parts,
        uint256 maxRoutes
    ) external view returns (SplitQuote memory result) {
        if (maxRoutes == 0 || maxRoutes > 4) revert InvalidMaxRoutes();
        return _quoteOptimalSplit(
            tokenIn, tokenOut, amountIn, routeData, routeCostInTokenOut, parts, maxRoutes
        );
    }

    function _quoteOptimalSplit(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        bytes[] calldata routeData,
        uint256[] calldata routeCostInTokenOut,
        uint256 parts,
        uint256 maxRoutes
    ) private view returns (SplitQuote memory result) {
        if (tokenIn == address(0) || tokenOut == address(0)) revert ZeroAddress();
        if (tokenIn == tokenOut) revert InvalidTokens();
        if (amountIn == 0) revert InvalidAmount();
        if (parts < 2 || parts > MAX_PARTS || parts > amountIn) revert InvalidParts();

        uint256 count = registry.dexCount();
        if (routeData.length != count || routeCostInTokenOut.length != count) revert InvalidRouteData();
        result.dexIds = new bytes32[](count);
        result.adapters = new address[](count);
        result.amountsIn = new uint256[](count);
        result.amountsOut = new uint256[](count);

        uint32[] memory priorities = new uint32[](count);
        bool[] memory executable = new bool[](count);
        for (uint256 i; i < count; ++i) {
            bytes32 dexId = registry.dexIdAt(i);
            (address adapter, bool enabled, uint32 priority) = registry.getDex(dexId);
            result.dexIds[i] = dexId;
            result.adapters[i] = adapter;
            priorities[i] = priority;
            executable[i] = enabled && adapter != address(0) && _supportsExecution(adapter);
        }

        uint256 basePart = amountIn / parts;
        uint256 remainder = amountIn % parts;
        bool allocatedAny;
        uint256 usedRoutes;
        for (uint256 part; part < parts; ++part) {
            uint256 chunk = basePart + (part == parts - 1 ? remainder : 0);
            uint256 bestIndex;
            uint256 bestMarginalNet;
            uint256 bestNewQuote;
            uint32 bestPriority;
            bool found;

            for (uint256 i; i < count; ++i) {
                if (!executable[i]) continue;
                if (result.amountsIn[i] == 0 && usedRoutes >= maxRoutes) continue;
                uint256 newAllocation = result.amountsIn[i] + chunk;
                try ILQCDexAdapter(result.adapters[i]).quoteExactInput(
                    tokenIn, tokenOut, newAllocation, routeData[i]
                ) returns (uint256 newQuote) {
                    if (newQuote <= result.amountsOut[i]) continue;
                    uint256 marginalNet = newQuote - result.amountsOut[i];
                    if (result.amountsIn[i] == 0) {
                        uint256 routeCost = routeCostInTokenOut[i];
                        if (marginalNet <= routeCost) continue;
                        marginalNet -= routeCost;
                    }
                    if (!found || marginalNet > bestMarginalNet ||
                        (marginalNet == bestMarginalNet && priorities[i] > bestPriority)) {
                        found = true;
                        bestIndex = i;
                        bestMarginalNet = marginalNet;
                        bestNewQuote = newQuote;
                        bestPriority = priorities[i];
                    }
                } catch {
                    // An unavailable route is isolated; remaining reviewed DEXs stay comparable.
                }
            }
            if (!found) revert NoExecutableRoute();
            if (result.amountsIn[bestIndex] == 0) ++usedRoutes;
            result.amountsIn[bestIndex] += chunk;
            result.amountsOut[bestIndex] = bestNewQuote;
            allocatedAny = true;
        }
        if (!allocatedAny) revert NoExecutableRoute();

        for (uint256 i; i < count; ++i) {
            if (result.amountsIn[i] == 0) continue;
            result.totalAmountOut += result.amountsOut[i];
            result.totalNetAmountOut += result.amountsOut[i] - routeCostInTokenOut[i];
        }
    }

    function _supportsExecution(address adapter) private pure returns (bool supported) {
        try ILQCExecutionAdapter(adapter).supportsExecution() returns (bool value) {
            supported = value;
        } catch {
            supported = false;
        }
    }
}
