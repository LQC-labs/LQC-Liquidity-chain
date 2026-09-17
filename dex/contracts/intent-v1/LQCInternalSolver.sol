// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {SafeTransferLib} from "../libraries/SafeTransferLib.sol";

interface IERC20InternalSolverBalance {
    function balanceOf(address account) external view returns (uint256);
}

interface ILQCIntentHubSolverRole {
    function acceptInternalSolver() external;
}

interface ILQCExecutionRouterForIntent {
    function swapExactInput(
        bytes32 dexId,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOutMinimum,
        address recipient,
        uint256 deadline,
        bytes calldata routeData
    ) external returns (uint256 amountOut);
}

/// @notice Permissioned Gate-2 adapter that executes one same-chain Intent through Router 2.0.
/// @dev It cannot pull user assets, choose arbitrary recipients or retain source-token custody.
contract LQCInternalSolver {
    using SafeTransferLib for address;

    address public immutable intentHub;
    address public immutable executionRouter;
    address public immutable administrator;
    uint256 private unlocked = 1;

    event InternalRouteExecuted(
        bytes32 indexed intentHash,
        bytes32 indexed dexId,
        address indexed recipient,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOut
    );

    error Unauthorized();
    error ZeroAddress();
    error InvalidAmount();
    error ResidualSourceToken();
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

    constructor(address intentHub_, address executionRouter_, address administrator_) {
        if (intentHub_ == address(0) || executionRouter_ == address(0) || administrator_ == address(0)) {
            revert ZeroAddress();
        }
        intentHub = intentHub_;
        executionRouter = executionRouter_;
        administrator = administrator_;
    }

    function acceptHubRole() external {
        if (msg.sender != administrator) revert Unauthorized();
        ILQCIntentHubSolverRole(intentHub).acceptInternalSolver();
    }

    function executeExactInput(
        bytes32 intentHash,
        bytes32 dexId,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOutMinimum,
        address recipient,
        uint256 deadline,
        bytes calldata routeData
    ) external onlyHub nonReentrant returns (uint256 amountOut) {
        if (amountIn == 0 || amountOutMinimum == 0) revert InvalidAmount();
        if (IERC20InternalSolverBalance(tokenIn).balanceOf(address(this)) != amountIn) revert ResidualSourceToken();

        tokenIn.forceApprove(executionRouter, amountIn);
        amountOut = ILQCExecutionRouterForIntent(executionRouter).swapExactInput(
            dexId, tokenIn, tokenOut, amountIn, amountOutMinimum, recipient, deadline, routeData
        );
        tokenIn.forceApprove(executionRouter, 0);
        if (IERC20InternalSolverBalance(tokenIn).balanceOf(address(this)) != 0) revert ResidualSourceToken();

        emit InternalRouteExecuted(intentHash, dexId, recipient, tokenIn, tokenOut, amountIn, amountOut);
    }
}
