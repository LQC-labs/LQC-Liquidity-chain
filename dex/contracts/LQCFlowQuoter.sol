// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ILQCFlowRouter} from "./interfaces/ILQCFlowRouter.sol";

/// @notice Read-only path evaluator for the LQC Flow AMM.
/// @dev Invalid or unavailable candidate paths are skipped instead of reverting the whole search.
contract LQCFlowQuoter {
    uint256 public constant MAX_CANDIDATES = 16;
    uint256 public constant MAX_PATH_LENGTH = 5;

    ILQCFlowRouter public immutable router;

    error InvalidRouter();
    error InvalidAmount();
    error InvalidCandidates();
    error InvalidPathEndpoints();
    error NoViablePath();

    constructor(address router_) {
        if (router_ == address(0)) revert InvalidRouter();
        router = ILQCFlowRouter(router_);
    }

    function quoteExactInput(uint256 amountIn, address[] calldata path)
        external
        view
        returns (uint256[] memory amounts)
    {
        if (amountIn == 0) revert InvalidAmount();
        _validatePath(path);
        return router.getAmountsOut(amountIn, path);
    }

    function quoteBestExactInput(uint256 amountIn, address[][] calldata candidates)
        external
        view
        returns (uint256 bestIndex, uint256 amountOut, uint256[] memory amounts)
    {
        if (amountIn == 0) revert InvalidAmount();
        if (candidates.length == 0 || candidates.length > MAX_CANDIDATES) revert InvalidCandidates();

        address expectedInput;
        address expectedOutput;
        bool endpointsSet;

        for (uint256 i; i < candidates.length; ++i) {
            address[] calldata path = candidates[i];
            _validatePath(path);

            if (!endpointsSet) {
                expectedInput = path[0];
                expectedOutput = path[path.length - 1];
                endpointsSet = true;
            } else if (path[0] != expectedInput || path[path.length - 1] != expectedOutput) {
                revert InvalidPathEndpoints();
            }

            try router.getAmountsOut(amountIn, path) returns (uint256[] memory quoted) {
                uint256 candidateOut = quoted[quoted.length - 1];
                if (candidateOut > amountOut) {
                    bestIndex = i;
                    amountOut = candidateOut;
                    amounts = quoted;
                }
            } catch {}
        }

        if (amountOut == 0) revert NoViablePath();
    }

    function _validatePath(address[] calldata path) private pure {
        if (path.length < 2 || path.length > MAX_PATH_LENGTH) revert InvalidCandidates();
        for (uint256 i; i < path.length; ++i) {
            if (path[i] == address(0)) revert InvalidCandidates();
            if (i > 0 && path[i] == path[i - 1]) revert InvalidCandidates();
        }
    }
}
