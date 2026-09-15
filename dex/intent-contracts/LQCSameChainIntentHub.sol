// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {SafeTransferLib} from "../contracts/libraries/SafeTransferLib.sol";

library LQCIntentQuoteTypes {
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

interface ILQCIntentProofVerifier {
    function verifyBestCandidate(
        LQCIntentQuoteTypes.QuoteRequest calldata request,
        LQCIntentQuoteTypes.QuoteResult[] calldata candidates,
        bytes[] calldata routeData,
        uint256 selectedIndex
    ) external view returns (bool);

    function bestCandidateProofHash(
        LQCIntentQuoteTypes.QuoteRequest calldata request,
        LQCIntentQuoteTypes.QuoteResult[] calldata candidates,
        uint256 selectedIndex
    ) external pure returns (bytes32);
}

interface ILQCIntentExecutionRouter {
    function registry() external view returns (address);

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

interface ILQCIntentDexRegistry {
    function getDex(bytes32 dexId) external view returns (address adapter, bool enabled, uint32 priority);
}

interface IERC20IntentBalance {
    function balanceOf(address account) external view returns (uint256);
}

/// @notice Gate 2 same-chain intent escrow using Router 2.0 as the first internal solver path.
/// @dev Deployed separately: it does not modify existing Router 2.0 bytecode or configuration.
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
    address public immutable proofVerifier;
    address public admin;
    uint256 public nextNonce;
    uint256 private unlocked = 1;

    mapping(address => bool) public authorizedSolver;
    mapping(bytes32 => Intent) public intents;
    mapping(bytes32 => bool) public consumedProof;

    error ZeroAddress();
    error InvalidTokens();
    error InvalidAmount();
    error InvalidDeadline();
    error Unauthorized();
    error InvalidStatus();
    error NotExpired();
    error IntentMismatch();
    error InvalidProof();
    error ProofAlreadyConsumed();
    error RegistryAdapterChanged();
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
        bytes32 indexed proofHash,
        address indexed solver,
        bytes32 dexId,
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

    constructor(address executionRouter_, address proofVerifier_, address admin_) {
        if (executionRouter_ == address(0) || proofVerifier_ == address(0) || admin_ == address(0)) {
            revert ZeroAddress();
        }
        executionRouter = executionRouter_;
        proofVerifier = proofVerifier_;
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

    function executeProvenIntent(
        bytes32 intentId,
        LQCIntentQuoteTypes.QuoteRequest calldata request,
        LQCIntentQuoteTypes.QuoteResult[] calldata candidates,
        bytes[] calldata routeData,
        uint256 selectedIndex
    ) external nonReentrant returns (bytes32 proofHash, uint256 amountOut) {
        if (!authorizedSolver[msg.sender]) revert Unauthorized();
        Intent storage intent = intents[intentId];
        if (intent.status != Status.Locked) revert InvalidStatus();
        if (block.timestamp > intent.deadline) revert InvalidDeadline();
        if (
            request.chainId != block.chainid || request.tokenIn != intent.tokenIn
                || request.tokenOut != intent.tokenOut || request.amountIn != intent.amountIn
                || request.recipient != intent.recipient || request.validUntil > intent.deadline
                || selectedIndex >= candidates.length
        ) revert IntentMismatch();

        LQCIntentQuoteTypes.QuoteResult calldata selected = candidates[selectedIndex];
        if (selected.minimumAmountOut < intent.minimumAmountOut) revert IntentMismatch();
        if (!ILQCIntentProofVerifier(proofVerifier).verifyBestCandidate(
            request, candidates, routeData, selectedIndex
        )) revert InvalidProof();

        proofHash = ILQCIntentProofVerifier(proofVerifier).bestCandidateProofHash(
            request, candidates, selectedIndex
        );
        if (proofHash == bytes32(0)) revert InvalidProof();
        if (consumedProof[proofHash]) revert ProofAlreadyConsumed();

        address registryAddress = ILQCIntentExecutionRouter(executionRouter).registry();
        (address currentAdapter, bool enabled,) =
            ILQCIntentDexRegistry(registryAddress).getDex(selected.dexId);
        if (!enabled || currentAdapter != selected.adapter) revert RegistryAdapterChanged();

        intent.status = Status.Executed;
        consumedProof[proofHash] = true;
        uint256 beforeBalance = IERC20IntentBalance(intent.tokenIn).balanceOf(address(this));
        intent.tokenIn.forceApprove(executionRouter, intent.amountIn);
        amountOut = ILQCIntentExecutionRouter(executionRouter).swapExactInput(
            selected.dexId,
            intent.tokenIn,
            intent.tokenOut,
            intent.amountIn,
            selected.minimumAmountOut,
            intent.recipient,
            request.validUntil,
            routeData[selectedIndex]
        );
        intent.tokenIn.forceApprove(executionRouter, 0);
        if (IERC20IntentBalance(intent.tokenIn).balanceOf(address(this)) + intent.amountIn != beforeBalance) {
            revert ResidualToken();
        }

        emit IntentExecuted(intentId, proofHash, msg.sender, selected.dexId, intent.amountIn, amountOut);
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
