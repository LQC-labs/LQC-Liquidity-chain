// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {LQCQuoteTypes} from "./LQCQuoteTypes.sol";

/// @notice Deterministic hashing shared by Router 2.0 and proof verification.
library LQCQuoteHash {
    bytes32 internal constant ROUTE_QUOTE_TYPEHASH = keccak256(
        "LQCRouteQuoteV1(uint256 chainId,uint256 quoteBlock,address tokenIn,address tokenOut,uint256 amountIn,address recipient,uint16 slippageBps,uint64 validUntil,bytes32 dexId,address adapter,bytes32 routeDataHash,uint256 grossAmountOut,uint256 gasCostInTokenOut,uint256 protocolFeeInTokenOut)"
    );

    function compute(
        LQCQuoteTypes.QuoteRequest calldata request,
        uint256 quoteBlock,
        bytes32 dexId,
        address adapter,
        bytes calldata routeData,
        uint256 grossAmountOut,
        uint256 gasCostInTokenOut,
        uint256 protocolFeeInTokenOut
    ) internal pure returns (bytes32) {
        return keccak256(abi.encode(
            ROUTE_QUOTE_TYPEHASH,
            request.chainId,
            quoteBlock,
            request.tokenIn,
            request.tokenOut,
            request.amountIn,
            request.recipient,
            request.slippageBps,
            request.validUntil,
            dexId,
            adapter,
            keccak256(routeData),
            grossAmountOut,
            gasCostInTokenOut,
            protocolFeeInTokenOut
        ));
    }
}
