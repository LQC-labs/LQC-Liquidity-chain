// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {SafeTransferLib} from "../libraries/SafeTransferLib.sol";
import {LQCCompositePlan} from "./LQCCompositePlan.sol";
import {LQCCompositeAdapterRegistry} from "./LQCCompositeAdapterRegistry.sol";

interface IERC20CompositeBalance {
    function balanceOf(address account) external view returns (uint256);
}

interface ILQCCompositeActionAdapter {
    function execute(address tokenIn, address tokenOut, uint256 amountIn, uint256 minAmountOut, bytes calldata data)
        external
        returns (uint256 amountOut);
}

/// @notice Atomic Gate-6 executor for a pre-committed same-chain Composite Intent plan.
/// @dev The Hub must fund this contract and invoke it in the same transaction. Any failed action
///      reverts every earlier action, approval, token movement and replay marker.
contract LQCCompositeExecutor {
    using SafeTransferLib for address;

    address public immutable intentHub;
    LQCCompositePlan public immutable planValidator;
    LQCCompositeAdapterRegistry public immutable adapterRegistry;
    mapping(bytes32 planHash => bool used) public planUsed;
    uint256 private unlocked = 1;

    event CompositePlanExecuted(
        bytes32 indexed intentHash,
        bytes32 indexed planHash,
        address indexed recipient,
        address finalToken,
        uint256 finalAmount,
        uint256 actionCount
    );

    error Unauthorized();
    error ZeroAddress();
    error InvalidExecution();
    error Expired();
    error PlanAlreadyUsed();
    error AdapterNotAllowed(uint256 index);
    error PayloadMismatch(uint256 index);
    error BalanceMismatch(uint256 index);
    error InsufficientOutput(uint256 index);
    error Reentrancy();

    modifier onlyHub() {
        if (msg.sender != intentHub) revert Unauthorized();
        _;
    }

    modifier nonReentrant() {
        if (unlocked != 1) revert Reentrancy();
        unlocked = 2;
        _;
        unlocked = 1;
    }

    constructor(address intentHub_, address planValidator_, address adapterRegistry_) {
        if (intentHub_ == address(0) || planValidator_ == address(0) || adapterRegistry_ == address(0)) {
            revert ZeroAddress();
        }
        if (planValidator_.code.length == 0 || adapterRegistry_.code.length == 0) revert InvalidExecution();
        intentHub = intentHub_;
        planValidator = LQCCompositePlan(planValidator_);
        adapterRegistry = LQCCompositeAdapterRegistry(adapterRegistry_);
    }

    function execute(
        bytes32 intentHash,
        address sourceToken,
        uint256 sourceAmount,
        address finalToken,
        address recipient,
        uint256 minFinalAmount,
        uint256 deadline,
        LQCCompositePlan.Action[] calldata actions,
        bytes[] calldata payloads
    ) external onlyHub nonReentrant returns (bytes32 planHash, uint256 finalAmount) {
        if (sourceAmount == 0 || payloads.length != actions.length) revert InvalidExecution();
        if (block.timestamp > deadline) revert Expired();
        (planHash,) = planValidator.validateAndHash(
            intentHash, sourceToken, finalToken, recipient, minFinalAmount, deadline, actions
        );
        if (planUsed[planHash]) revert PlanAlreadyUsed();
        if (IERC20CompositeBalance(sourceToken).balanceOf(address(this)) != sourceAmount) revert BalanceMismatch(0);
        planUsed[planHash] = true;

        uint256 amount = sourceAmount;
        for (uint256 index; index < actions.length; ++index) {
            LQCCompositePlan.Action calldata action = actions[index];
            if (!adapterRegistry.isAdapterAllowed(action.adapter, uint8(action.kind))) revert AdapterNotAllowed(index);
            if (keccak256(payloads[index]) != action.dataHash) revert PayloadMismatch(index);
            if (IERC20CompositeBalance(action.tokenIn).balanceOf(address(this)) != amount) revert BalanceMismatch(index);

            uint256 outputBefore = IERC20CompositeBalance(action.tokenOut).balanceOf(address(this));
            action.tokenIn.forceApprove(action.adapter, amount);
            uint256 reported = ILQCCompositeActionAdapter(action.adapter).execute(
                action.tokenIn, action.tokenOut, amount, action.minAmountOut, payloads[index]
            );
            action.tokenIn.forceApprove(action.adapter, 0);
            if (IERC20CompositeBalance(action.tokenIn).balanceOf(address(this)) != 0) revert BalanceMismatch(index);
            uint256 received = IERC20CompositeBalance(action.tokenOut).balanceOf(address(this)) - outputBefore;
            if (received != reported) revert BalanceMismatch(index);
            if (received < action.minAmountOut) revert InsufficientOutput(index);
            amount = received;
        }

        if (amount < minFinalAmount || IERC20CompositeBalance(finalToken).balanceOf(address(this)) != amount) {
            revert InsufficientOutput(actions.length);
        }
        uint256 recipientBefore = IERC20CompositeBalance(finalToken).balanceOf(recipient);
        finalToken.safeTransfer(recipient, amount);
        if (
            IERC20CompositeBalance(finalToken).balanceOf(address(this)) != 0
                || IERC20CompositeBalance(finalToken).balanceOf(recipient) - recipientBefore != amount
        ) revert BalanceMismatch(actions.length);
        finalAmount = amount;
        emit CompositePlanExecuted(intentHash, planHash, recipient, finalToken, finalAmount, actions.length);
    }
}
