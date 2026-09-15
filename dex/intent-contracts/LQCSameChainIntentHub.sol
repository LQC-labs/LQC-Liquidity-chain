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

    bytes32 public constant EIP712_DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 public constant SIGNED_INTENT_TYPEHASH = keccak256(
        "SignedIntent(address owner,address recipient,address tokenIn,address tokenOut,uint256 amountIn,uint256 minimumAmountOut,uint64 deadline,uint256 nonce)"
    );
    bytes32 public constant NAME_HASH = keccak256("LQC Same Chain Intent Hub");
    bytes32 public constant VERSION_HASH = keccak256("1");
    uint256 private constant SECP256K1_HALF_ORDER =
        0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0;
    uint64 public constant SOLVER_ACTIVATION_DELAY = 1 days;

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

    struct SignedIntent {
        address owner;
        address recipient;
        address tokenIn;
        address tokenOut;
        uint256 amountIn;
        uint256 minimumAmountOut;
        uint64 deadline;
        uint256 nonce;
    }

    address public immutable executionRouter;
    address public immutable proofVerifier;
    address public admin;
    address public pendingAdmin;
    address public guardian;
    bool public executionPaused;
    uint256 public nextNonce;
    uint256 private unlocked = 1;

    mapping(address => bool) public authorizedSolver;
    mapping(address => uint64) public solverActivationTime;
    mapping(bytes32 => Intent) public intents;
    mapping(bytes32 => bool) public consumedProof;
    mapping(address => mapping(uint256 => bool)) public signedNonceUsed;

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
    error InvalidSignature();
    error NonceAlreadyUsed();
    error ResidualToken();
    error Reentrancy();
    error Paused();
    error ActivationNotReady();
    error SolverNotScheduled();

    event SolverAuthorizationScheduled(address indexed solver, uint256 activationTime);
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
    event ExecutionPaused(address indexed caller);
    event ExecutionResumed(address indexed caller);
    event GuardianSet(address indexed oldGuardian, address indexed newGuardian);
    event AdminTransferProposed(address indexed currentAdmin, address indexed pendingAdmin);
    event AdminTransferred(address indexed oldAdmin, address indexed newAdmin);

    modifier whenExecutionActive() {
        if (executionPaused) revert Paused();
        _;
    }

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
        guardian = admin_;
    }

    function scheduleSolver(address solver) external {
        if (msg.sender != admin) revert Unauthorized();
        if (solver == address(0)) revert ZeroAddress();
        uint64 activationTime = uint64(block.timestamp + SOLVER_ACTIVATION_DELAY);
        solverActivationTime[solver] = activationTime;
        emit SolverAuthorizationScheduled(solver, activationTime);
    }

    function activateSolver(address solver) external {
        uint64 activationTime = solverActivationTime[solver];
        if (activationTime == 0) revert SolverNotScheduled();
        if (block.timestamp < activationTime) revert ActivationNotReady();
        delete solverActivationTime[solver];
        authorizedSolver[solver] = true;
        emit SolverAuthorizationSet(solver, true);
    }

    function revokeSolver(address solver) external {
        if (msg.sender != admin && msg.sender != guardian) revert Unauthorized();
        if (solver == address(0)) revert ZeroAddress();
        delete solverActivationTime[solver];
        authorizedSolver[solver] = false;
        emit SolverAuthorizationSet(solver, false);
    }

    function pauseExecution() external {
        if (msg.sender != admin && msg.sender != guardian) revert Unauthorized();
        executionPaused = true;
        emit ExecutionPaused(msg.sender);
    }

    function resumeExecution() external {
        if (msg.sender != admin) revert Unauthorized();
        executionPaused = false;
        emit ExecutionResumed(msg.sender);
    }

    function setGuardian(address newGuardian) external {
        if (msg.sender != admin) revert Unauthorized();
        if (newGuardian == address(0)) revert ZeroAddress();
        address oldGuardian = guardian;
        guardian = newGuardian;
        emit GuardianSet(oldGuardian, newGuardian);
    }

    function proposeAdmin(address newAdmin) external {
        if (msg.sender != admin) revert Unauthorized();
        if (newAdmin == address(0)) revert ZeroAddress();
        pendingAdmin = newAdmin;
        emit AdminTransferProposed(admin, newAdmin);
    }

    function acceptAdmin() external {
        if (msg.sender != pendingAdmin) revert Unauthorized();
        address oldAdmin = admin;
        admin = msg.sender;
        pendingAdmin = address(0);
        emit AdminTransferred(oldAdmin, msg.sender);
    }

    function domainSeparator() public view returns (bytes32) {
        return keccak256(abi.encode(
            EIP712_DOMAIN_TYPEHASH,
            NAME_HASH,
            VERSION_HASH,
            block.chainid,
            address(this)
        ));
    }

    function hashSignedIntent(SignedIntent calldata signedIntent) public view returns (bytes32) {
        bytes32 structHash = keccak256(abi.encode(
            SIGNED_INTENT_TYPEHASH,
            signedIntent.owner,
            signedIntent.recipient,
            signedIntent.tokenIn,
            signedIntent.tokenOut,
            signedIntent.amountIn,
            signedIntent.minimumAmountOut,
            signedIntent.deadline,
            signedIntent.nonce
        ));
        return keccak256(abi.encodePacked(bytes2(0x1901), domainSeparator(), structHash));
    }

    function lockIntent(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minimumAmountOut,
        address recipient,
        uint256 deadline
    ) external whenExecutionActive nonReentrant returns (bytes32 intentId) {
        uint256 nonce = nextNonce++;
        intentId = keccak256(abi.encode(bytes1(0x00), block.chainid, address(this), msg.sender, nonce));
        _lock(intentId, msg.sender, tokenIn, tokenOut, amountIn, minimumAmountOut, recipient, deadline);
    }

    /// @notice Lets any relayer lock a pre-approved owner's funds without changing signed terms.
    function lockIntentBySig(SignedIntent calldata signedIntent, bytes calldata signature)
        external
        whenExecutionActive
        nonReentrant
        returns (bytes32 intentId)
    {
        if (signedIntent.owner == address(0)) revert ZeroAddress();
        if (signedNonceUsed[signedIntent.owner][signedIntent.nonce]) revert NonceAlreadyUsed();
        bytes32 digest = hashSignedIntent(signedIntent);
        if (_recoverSigner(digest, signature) != signedIntent.owner) revert InvalidSignature();

        signedNonceUsed[signedIntent.owner][signedIntent.nonce] = true;
        intentId = keccak256(abi.encode(bytes1(0x01), digest));
        _lock(
            intentId,
            signedIntent.owner,
            signedIntent.tokenIn,
            signedIntent.tokenOut,
            signedIntent.amountIn,
            signedIntent.minimumAmountOut,
            signedIntent.recipient,
            signedIntent.deadline
        );
    }

    function _lock(
        bytes32 intentId,
        address owner,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minimumAmountOut,
        address recipient,
        uint256 deadline
    ) private {
        if (owner == address(0) || tokenIn == address(0) || tokenOut == address(0) || recipient == address(0)) {
            revert ZeroAddress();
        }
        if (tokenIn == tokenOut) revert InvalidTokens();
        if (
            amountIn == 0 || minimumAmountOut == 0 || amountIn > type(uint128).max
                || minimumAmountOut > type(uint128).max
        ) revert InvalidAmount();
        if (deadline <= block.timestamp || deadline > type(uint64).max) revert InvalidDeadline();
        if (intents[intentId].status != Status.None) revert InvalidStatus();

        intents[intentId] = Intent({
            owner: owner,
            recipient: recipient,
            tokenIn: tokenIn,
            tokenOut: tokenOut,
            amountIn: uint128(amountIn),
            minimumAmountOut: uint128(minimumAmountOut),
            deadline: uint64(deadline),
            status: Status.Locked
        });

        uint256 beforeBalance = IERC20IntentBalance(tokenIn).balanceOf(address(this));
        tokenIn.safeTransferFrom(owner, address(this), amountIn);
        if (IERC20IntentBalance(tokenIn).balanceOf(address(this)) - beforeBalance != amountIn) {
            revert ResidualToken();
        }

        emit IntentLocked(
            intentId, owner, recipient, tokenIn, tokenOut, amountIn, minimumAmountOut, deadline
        );
    }

    function _recoverSigner(bytes32 digest, bytes calldata signature) private pure returns (address signer) {
        if (signature.length != 65) revert InvalidSignature();
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := calldataload(signature.offset)
            s := calldataload(add(signature.offset, 32))
            v := byte(0, calldataload(add(signature.offset, 64)))
        }
        if (uint256(s) > SECP256K1_HALF_ORDER || (v != 27 && v != 28)) revert InvalidSignature();
        signer = ecrecover(digest, v, r, s);
        if (signer == address(0)) revert InvalidSignature();
    }

    function executeProvenIntent(
        bytes32 intentId,
        LQCIntentQuoteTypes.QuoteRequest calldata request,
        LQCIntentQuoteTypes.QuoteResult[] calldata candidates,
        bytes[] calldata routeData,
        uint256 selectedIndex
    ) external whenExecutionActive nonReentrant returns (bytes32 proofHash, uint256 amountOut) {
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
