// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ILQCDexAdapter} from "./interfaces/ILQCDexAdapter.sol";
import {ILQCDexRegistry} from "./interfaces/ILQCDexRegistry.sol";

/// @notice Read-only Router 2.0 component that selects the best valid adapter quote.
contract LQCQuoteRouter {
    ILQCDexRegistry public immutable registry;

    struct BestQuote {
        bytes32 dexId;
        address adapter;
        uint256 amountOut;
        uint32 priority;
    }

    error ZeroAddress();
    error InvalidTokens();
    error InvalidAmount();
    error NoValidQuote();

    constructor(address registry_) {
        if (registry_ == address(0)) revert ZeroAddress();
        registry = ILQCDexRegistry(registry_);
    }

    function quoteBest(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        bytes[] calldata routeData
    ) external view returns (BestQuote memory best) {
        if (tokenIn == address(0) || tokenOut == address(0) || tokenIn == tokenOut) revert InvalidTokens();
        if (amountIn == 0) revert InvalidAmount();

        uint256 count = registry.dexCount();
        if (routeData.length != count) revert NoValidQuote();

        for (uint256 i; i < count; ++i) {
            bytes32 dexId = registry.dexIdAt(i);
            (address adapter, bool enabled, uint32 priority) = registry.getDex(dexId);
            if (!enabled || adapter == address(0)) continue;

            try ILQCDexAdapter(adapter).quoteExactInput(tokenIn, tokenOut, amountIn, routeData[i])
                returns (uint256 amountOut)
            {
                if (amountOut > best.amountOut || (amountOut == best.amountOut && priority > best.priority)) {
                    best = BestQuote(dexId, adapter, amountOut, priority);
                }
            } catch {
                // A failing adapter must not block quotes from other approved DEXs.
            }
        }

        if (best.amountOut == 0) revert NoValidQuote();
    }
}
