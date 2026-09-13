// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Canonical Router 2.0 quote types shared by quote, proof, SDK, and execution layers.
library LQCQuoteTypes {
    uint16 internal constant BPS = 10_000;
    uint16 internal constant MAX_SLIPPAGE_BPS = 2_000;

    struct QuoteRequest {
        uint256 chainId;
        address tokenIn;
        address tokenOut;
        uint256 amountIn;
        address recipient;
        uint16 slippageBps;
        uint64 validUntil;
    }

    struct QuoteResult {
        bytes32 dexId;
        address adapter;
        uint256 quoteBlock;
        uint256 grossAmountOut;
        uint256 gasCostInTokenOut;
        uint256 protocolFeeInTokenOut;
        uint256 netAmountOut;
        uint256 minimumAmountOut;
        uint32 priority;
        bytes32 routeHash;
    }
}
