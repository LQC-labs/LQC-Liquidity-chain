// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ILQCDexAdapter} from "./interfaces/ILQCDexAdapter.sol";
import {ILQCDexRegistry} from "./interfaces/ILQCDexRegistry.sol";
import {LQCQuoteTypes} from "./libraries/LQCQuoteTypes.sol";

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
    error InvalidChain();
    error InvalidRecipient();
    error InvalidSlippage();
    error QuoteExpired();
    error InvalidQuoteMetadata();
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

    /// @notice Compares approved DEX quotes by executable net output after caller-supplied costs.
    /// @dev Cost arrays must be denominated in tokenOut and aligned with the registry order.
    function quoteBestNet(
        LQCQuoteTypes.QuoteRequest calldata request,
        bytes[] calldata routeData,
        uint256[] calldata gasCostInTokenOut,
        uint256[] calldata protocolFeeInTokenOut
    ) external view returns (LQCQuoteTypes.QuoteResult memory best) {
        _validateRequest(request);
        uint256 count = registry.dexCount();
        if (
            routeData.length != count ||
            gasCostInTokenOut.length != count ||
            protocolFeeInTokenOut.length != count
        ) revert InvalidQuoteMetadata();

        bool found;
        for (uint256 i; i < count; ++i) {
            bytes32 dexId = registry.dexIdAt(i);
            (address adapter, bool enabled, uint32 priority) = registry.getDex(dexId);
            if (!enabled || adapter == address(0)) continue;

            try ILQCDexAdapter(adapter).quoteExactInput(
                request.tokenIn, request.tokenOut, request.amountIn, routeData[i]
            ) returns (uint256 grossAmountOut) {
                uint256 totalCost = gasCostInTokenOut[i] + protocolFeeInTokenOut[i];
                if (grossAmountOut <= totalCost) continue;
                uint256 netAmountOut = grossAmountOut - totalCost;
                if (!found || netAmountOut > best.netAmountOut ||
                    (netAmountOut == best.netAmountOut && priority > best.priority)) {
                    found = true;
                    best = LQCQuoteTypes.QuoteResult({
                        dexId: dexId,
                        adapter: adapter,
                        quoteBlock: block.number,
                        grossAmountOut: grossAmountOut,
                        gasCostInTokenOut: gasCostInTokenOut[i],
                        protocolFeeInTokenOut: protocolFeeInTokenOut[i],
                        netAmountOut: netAmountOut,
                        minimumAmountOut: grossAmountOut *
                            (LQCQuoteTypes.BPS - request.slippageBps) / LQCQuoteTypes.BPS,
                        priority: priority,
                        routeHash: keccak256(abi.encode(
                            request.chainId,
                            block.number,
                            request.tokenIn,
                            request.tokenOut,
                            request.amountIn,
                            request.recipient,
                            request.slippageBps,
                            request.validUntil,
                            dexId,
                            adapter,
                            keccak256(routeData[i]),
                            grossAmountOut,
                            gasCostInTokenOut[i],
                            protocolFeeInTokenOut[i]
                        ))
                    });
                }
            } catch {
                // A failing adapter remains isolated from all other approved routes.
            }
        }
        if (!found) revert NoValidQuote();
    }

    function _validateRequest(LQCQuoteTypes.QuoteRequest calldata request) private view {
        if (request.chainId != block.chainid) revert InvalidChain();
        if (request.tokenIn == address(0) || request.tokenOut == address(0) ||
            request.tokenIn == request.tokenOut) revert InvalidTokens();
        if (request.amountIn == 0) revert InvalidAmount();
        if (request.recipient == address(0)) revert InvalidRecipient();
        if (request.slippageBps > LQCQuoteTypes.MAX_SLIPPAGE_BPS) revert InvalidSlippage();
        if (request.validUntil < block.timestamp) revert QuoteExpired();
    }
}
