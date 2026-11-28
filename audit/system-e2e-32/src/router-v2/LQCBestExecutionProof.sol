// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {LQCQuoteTypes} from "./libraries/LQCQuoteTypes.sol";
import {LQCQuoteHash} from "./libraries/LQCQuoteHash.sol";

/// @notice Stateless verifier for a Router 2.0 selected-route quote.
/// @dev V1 proves quote integrity and cost arithmetic. Candidate-set superiority remains off-chain evidence.
contract LQCBestExecutionProof {
    uint256 public constant MAX_CANDIDATES = 16;
    bytes32 public constant PROOF_TYPEHASH = keccak256(
        "LQCBestExecutionProofV1(bytes32 routeHash,uint256 chainId,uint256 quoteBlock,uint256 netAmountOut,uint256 minimumAmountOut,uint64 validUntil)"
    );

    function verifySelectedQuote(
        LQCQuoteTypes.QuoteRequest calldata request,
        LQCQuoteTypes.QuoteResult calldata result,
        bytes calldata routeData
    ) external view returns (bool) {
        return _verifySelectedQuote(request, result, routeData);
    }

    /// @notice Verifies every supplied route and proves the selected index has the best net output.
    /// @dev Candidate order is committed to the proof; ties resolve by priority, then earliest index.
    function verifyBestCandidate(
        LQCQuoteTypes.QuoteRequest calldata request,
        LQCQuoteTypes.QuoteResult[] calldata candidates,
        bytes[] calldata routeData,
        uint256 selectedIndex
    ) external view returns (bool) {
        uint256 count = candidates.length;
        if (count == 0 || count > MAX_CANDIDATES || routeData.length != count || selectedIndex >= count) {
            return false;
        }
        LQCQuoteTypes.QuoteResult calldata selected = candidates[selectedIndex];
        for (uint256 i; i < count; ++i) {
            if (!_verifySelectedQuote(request, candidates[i], routeData[i])) return false;
            if (candidates[i].quoteBlock != selected.quoteBlock) return false;
            for (uint256 j; j < i; ++j) {
                if (candidates[j].dexId == candidates[i].dexId) return false;
            }
            if (candidates[i].netAmountOut > selected.netAmountOut) return false;
            if (candidates[i].netAmountOut == selected.netAmountOut) {
                if (candidates[i].priority > selected.priority) return false;
                if (candidates[i].priority == selected.priority && i < selectedIndex) return false;
            }
        }
        return true;
    }

    function candidateSetHash(LQCQuoteTypes.QuoteResult[] calldata candidates)
        public pure returns (bytes32)
    {
        bytes32[] memory routeHashes = new bytes32[](candidates.length);
        for (uint256 i; i < candidates.length; ++i) routeHashes[i] = candidates[i].routeHash;
        return keccak256(abi.encode(routeHashes));
    }

    function bestCandidateProofHash(
        LQCQuoteTypes.QuoteRequest calldata request,
        LQCQuoteTypes.QuoteResult[] calldata candidates,
        uint256 selectedIndex
    ) external pure returns (bytes32) {
        if (candidates.length == 0 || selectedIndex >= candidates.length) return bytes32(0);
        return keccak256(abi.encode(
            PROOF_TYPEHASH,
            candidateSetHash(candidates),
            candidates[selectedIndex].routeHash,
            request.chainId,
            candidates[selectedIndex].quoteBlock,
            candidates[selectedIndex].netAmountOut,
            candidates[selectedIndex].minimumAmountOut,
            request.validUntil
        ));
    }

    function computeRouteHash(
        LQCQuoteTypes.QuoteRequest calldata request,
        uint256 quoteBlock,
        bytes32 dexId,
        address adapter,
        bytes calldata routeData,
        uint256 grossAmountOut,
        uint256 gasCostInTokenOut,
        uint256 protocolFeeInTokenOut
    ) external pure returns (bytes32) {
        return LQCQuoteHash.compute(
            request, quoteBlock, dexId, adapter, routeData,
            grossAmountOut, gasCostInTokenOut, protocolFeeInTokenOut
        );
    }

    function _verifySelectedQuote(
        LQCQuoteTypes.QuoteRequest calldata request,
        LQCQuoteTypes.QuoteResult calldata result,
        bytes calldata routeData
    ) private view returns (bool) {
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
