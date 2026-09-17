// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Deterministic Gate-6 commitment for an atomic same-chain action sequence.
/// @dev This contract validates and hashes plans only. It cannot approve tokens, call adapters,
///      move funds or execute a plan.
contract LQCCompositePlan {
    uint256 public constant MIN_ACTIONS = 2;
    uint256 public constant MAX_ACTIONS = 8;

    bytes32 public constant ACTION_TYPEHASH = keccak256(
        "CompositeAction(uint8 kind,address adapter,address tokenIn,address tokenOut,uint256 minAmountOut,bytes32 dataHash)"
    );
    bytes32 public constant PLAN_TYPEHASH = keccak256(
        "CompositePlan(bytes32 intentHash,address sourceToken,address finalToken,address recipient,uint256 minFinalAmount,uint256 deadline,uint256 actionCount,bytes32 actionsHash)"
    );
    bytes32 private constant ACTIONS_SEED = keccak256("LQC_COMPOSITE_ACTIONS_V1");

    enum ActionKind {
        SWAP,
        VAULT_DEPOSIT,
        LENDING_SUPPLY
    }

    struct Action {
        ActionKind kind;
        address adapter;
        address tokenIn;
        address tokenOut;
        uint256 minAmountOut;
        bytes32 dataHash;
    }

    error InvalidPlan();
    error InvalidAction(uint256 index);
    error BrokenTokenContinuity(uint256 index);

    function hashAction(Action calldata action) public pure returns (bytes32) {
        return keccak256(
            abi.encode(
                ACTION_TYPEHASH,
                action.kind,
                action.adapter,
                action.tokenIn,
                action.tokenOut,
                action.minAmountOut,
                action.dataHash
            )
        );
    }

    function validateAndHash(
        bytes32 intentHash,
        address sourceToken,
        address finalToken,
        address recipient,
        uint256 minFinalAmount,
        uint256 deadline,
        Action[] calldata actions
    ) external pure returns (bytes32 planHash, bytes32 actionsHash) {
        uint256 length = actions.length;
        if (
            intentHash == bytes32(0) || sourceToken == address(0) || finalToken == address(0)
                || recipient == address(0) || minFinalAmount == 0 || deadline == 0 || length < MIN_ACTIONS
                || length > MAX_ACTIONS
        ) revert InvalidPlan();

        actionsHash = ACTIONS_SEED;
        address expectedInput = sourceToken;
        for (uint256 index; index < length; ++index) {
            Action calldata action = actions[index];
            if (
                action.adapter == address(0) || action.tokenIn == address(0) || action.tokenOut == address(0)
                    || action.tokenIn == action.tokenOut || action.minAmountOut == 0 || action.dataHash == bytes32(0)
            ) revert InvalidAction(index);
            if (action.tokenIn != expectedInput) revert BrokenTokenContinuity(index);
            expectedInput = action.tokenOut;
            actionsHash = keccak256(abi.encode(actionsHash, hashAction(action)));
        }
        if (expectedInput != finalToken || actions[length - 1].minAmountOut < minFinalAmount) revert InvalidPlan();

        planHash = keccak256(
            abi.encode(
                PLAN_TYPEHASH,
                intentHash,
                sourceToken,
                finalToken,
                recipient,
                minFinalAmount,
                deadline,
                length,
                actionsHash
            )
        );
    }
}
