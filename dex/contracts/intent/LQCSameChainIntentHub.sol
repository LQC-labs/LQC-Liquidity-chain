// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {SafeTransferLib} from "../libraries/SafeTransferLib.sol";

interface ILQCIntentExecutionRouter {
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

interface IERC20IntentBalance {
    function balanceOf(address account) external view returns (uint256);
}

/// @notice Gate 2 same-chain intent escrow using Router 2.0 as the first internal solver path.
/// @dev Deployed separately: it does not modify the existing Router 2.0 bytecode or configuration.
contract LQCSameChainIntentHub {
    using SafeTransferLib for address;

    enum Status {
        None,
        Locked,
        Executed,
        Refunded
    }

    struct Intent {
        address owner;
        address recipient;
        address tokenIn;
        address tokenOut;
        uint128 amountIn;
        uint128 minimumAmountOut;
        uint64 deadline;
        Status status;
    }

    address public immutable executionRouter;
    address public admin;
    uint256 public nextNonce;
    uint256 private unlocked = 1;

    mapping(address => bool) public authorizedSolver;
    mapping(bytes32 => Intent) public intents;

    error ZeroAddress();
    error InvalidTokens();
    error InvalidAmount();
    error InvalidDeadline();
    error Unauthorized();
    error InvalidStatus();
    error NotExpired();
    error ResidualToken();
    error Reentrancy();

    event SolverAuthorizationSet(address indexed solver, bool allowed);
    event IntentLocked(
        bytes32 indexed intentId,
        address indexed owner,
        address indexed recipient,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minimumAmountOut,
        uint256 deadline
    );
    event IntentExecuted(
        bytes32 indexed intentId,
        address indexed solver,
        bytes32 indexed dexId,
        uint256 amountIn,
        uint256 amountOut
    );
    event IntentRefunded(bytes32 indexed intentId, address indexed owner, uint256 amountIn);

    modifier nonReentrant() {
        if (unlocked != 1) revert Reentrancy();
        unlocked = 2;
        _;
        unlocked = 1;
    }

    constructor(address executionRouter_, address admin_) {
        if (executionRouter_ == address(0) || admin_ == address(0)) revert ZeroAddress();
        executionRouter = executionRouter_;
        admin = admin_;
    }

    function setSolver(address solver, bool allowed) external {
        if (msg.sender != admin) revert Unauthorized();
        if (solver == address(0)) revert ZeroAddress();
        authorizedSolver[solver] = allowed;
        emit SolverAuthorizationSet(solver, allowed);
    }

    function transferAdmin(address newAdmin) external {
        if (msg.sender != admin) revert Unauthorized();
        if (newAdmin == address(0)) revert ZeroAddress();
        admin = newAdmin;
    }

    function lockIntent(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minimumAmountOut,
        address recipient,
        uint256 deadline
    ) external nonReentrant returns (bytes32 intentId) {
        if (tokenIn == address(0) || tokenOut == address(0) || recipient == address(0)) revert ZeroAddress();
        if (tokenIn == tokenOut) revert InvalidTokens();
        if (
            amountIn == 0 || minimumAmountOut == 0 || amountIn > type(uint128).max
                || minimumAmountOut > type(uint128).max
        ) revert InvalidAmount();
        if (deadline <= block.timestamp || deadline > type(uint64).max) revert InvalidDeadline();

        uint256 nonce = nextNonce++;
        intentId = keccak256(abi.encode(block.chainid, address(this), msg.sender, nonce));
        intents[intentId] = Intent({
            owner: msg.sender,
            recipient: recipient,
            tokenIn: tokenIn,
            tokenOut: tokenOut,
            amountIn: uint128(amountIn),
            minimumAmountOut: uint128(minimumAmountOut),
            deadline: uint64(deadline),
            status: Status.Locked
        });

        uint256 beforeBalance = IERC20IntentBalance(tokenIn).balanceOf(address(this));
        tokenIn.safeTransferFrom(msg.sender, address(this), amountIn);
        if (IERC20IntentBalance(tokenIn).balanceOf(address(this)) - beforeBalance != amountIn) {
            revert ResidualToken();
        }

        emit IntentLocked(
            intentId, msg.sender, recipient, tokenIn, tokenOut, amountIn, minimumAmountOut, deadline
        );
    }

    function executeIntent(bytes32 intentId, bytes32 dexId, bytes calldata routeData)
        external
        nonReentrant
        returns (uint256 amountOut)
    {
        if (!authorizedSolver[msg.sender]) revert Unauthorized();
        Intent storage intent = intents[intentId];
        if (intent.status != Status.Locked) revert InvalidStatus();
        if (block.timestamp > intent.deadline) revert InvalidDeadline();

        intent.status = Status.Executed;
        uint256 beforeBalance = IERC20IntentBalance(intent.tokenIn).balanceOf(address(this));
        intent.tokenIn.forceApprove(executionRouter, intent.amountIn);
        amountOut = ILQCIntentExecutionRouter(executionRouter).swapExactInput(
            dexId,
            intent.tokenIn,
            intent.tokenOut,
            intent.amountIn,
            intent.minimumAmountOut,
            intent.recipient,
            intent.deadline,
            routeData
        );
        intent.tokenIn.forceApprove(executionRouter, 0);
        if (IERC20IntentBalance(intent.tokenIn).balanceOf(address(this)) + intent.amountIn != beforeBalance) {
            revert ResidualToken();
        }

        emit IntentExecuted(intentId, msg.sender, dexId, intent.amountIn, amountOut);
    }

    function cancelIntent(bytes32 intentId) external nonReentrant {
        Intent storage intent = intents[intentId];
        if (intent.owner != msg.sender) revert Unauthorized();
        _refund(intentId, intent);
    }

    function refundExpiredIntent(bytes32 intentId) external nonReentrant {
        Intent storage intent = intents[intentId];
        if (intent.status != Status.Locked) revert InvalidStatus();
        if (block.timestamp <= intent.deadline) revert NotExpired();
        _refund(intentId, intent);
    }

    function _refund(bytes32 intentId, Intent storage intent) private {
        if (intent.status != Status.Locked) revert InvalidStatus();
        intent.status = Status.Refunded;
        intent.tokenIn.safeTransfer(intent.owner, intent.amountIn);
        emit IntentRefunded(intentId, intent.owner, intent.amountIn);
    }
}
