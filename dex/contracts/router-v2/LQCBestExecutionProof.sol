// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {LQCQuoteTypes} from "./libraries/LQCQuoteTypes.sol";
import {LQCQuoteHash} from "./libraries/LQCQuoteHash.sol";

/// @notice Stateless verifier for a Router 2.0 selected-route quote.
/// @dev V1 proves quote integrity and cost arithmetic. Candidate-set superiority remains off-chain evidence.
contract LQCBestExecutionProof {
    bytes32 public constant PROOF_TYPEHASH = keccak256(
        "LQCBestExecutionProofV1(bytes32 routeHash,uint256 chainId,uint256 quoteBlock,uint256 netAmountOut,uint256 minimumAmountOut,uint64 validUntil)"
    );

    function verifySelectedQuote(
        LQCQuoteTypes.QuoteRequest calldata request,
        LQCQuoteTypes.QuoteResult calldata result,
        bytes calldata routeData
    ) external view returns (bool) {
        if (request.chainId != block.chainid || request.validUntil < block.timestamp) return false;
        if (request.tokenIn == address(0) || request.tokenOut == address(0) ||
            request.tokenIn == request.tokenOut || request.amountIn == 0 || request.recipient == address(0)) return false;
        if (request.slippageBps > LQCQuoteTypes.MAX_SLIPPAGE_BPS) return false;
        if (result.dexId == bytes32(0) || result.adapter == address(0) || result.grossAmountOut == 0) return false;
        uint256 totalCost = result.gasCostInTokenOut + result.protocolFeeInTokenOut;
        if (result.grossAmountOut <= totalCost || result.netAmountOut != result.grossAmountOut - totalCost) return false;
        if (result.minimumAmountOut != result.grossAmountOut *
            (LQCQuoteTypes.BPS - request.slippageBps) / LQCQuoteTypes.BPS) return false;
        return result.routeHash == LQCQuoteHash.compute(
            request,
            result.quoteBlock,
            result.dexId,
            result.adapter,
            routeData,
            result.grossAmountOut,
            result.gasCostInTokenOut,
            result.protocolFeeInTokenOut
        );
    }

    function proofHash(
        LQCQuoteTypes.QuoteRequest calldata request,
        LQCQuoteTypes.QuoteResult calldata result
    ) external pure returns (bytes32) {
        return keccak256(abi.encode(
            PROOF_TYPEHASH,
            result.routeHash,
            request.chainId,
            result.quoteBlock,
            result.netAmountOut,
            result.minimumAmountOut,
            request.validUntil
        ));
    }
}
