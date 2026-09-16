// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {LQCIntentTypes} from "./LQCIntentTypes.sol";
import {LQCSourceEscrow} from "./LQCSourceEscrow.sol";
import {LQCQuoteManager} from "./LQCQuoteManager.sol";
import {LQCSolverRegistry} from "./LQCSolverRegistry.sol";

interface ILQCInternalSolverExecution {
    function intentHub() external view returns (address);
    function executionRouter() external view returns (address);

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
    ) external returns (uint256 amountOut);
}

/// @notice Phase-1 LQC intent lifecycle with EIP-712 authorization and per-intent escrow.
/// @dev Cross-chain proof verification, solver auctions and challenge settlement are deliberately
///      separate later modules. The current settler is a restricted testnet bootstrap role.
contract LQCIntentHub {
    bytes32 public constant INTENT_TYPEHASH = keccak256(
        "Intent(address user,uint256 sourceChainId,address sourceToken,uint256 sourceAmount,uint256 destinationChainId,address destinationToken,address recipient,uint256 minAmountOut,uint256 deadline,uint256 nonce,bytes32 salt)"
    );
    bytes32 private constant DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 private constant NAME_HASH = keccak256("LQC Intent Hub");
    bytes32 private constant VERSION_HASH = keccak256("1");
    uint256 private constant SECP256K1N_HALF =
        0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0;

    address public owner;
    address public pendingOwner;
    address public settler;
    address public pendingSettler;
    address public guardian;
    address public internalSolver;
    address public pendingInternalSolver;
    LQCQuoteManager public quoteManager;
    LQCSolverRegistry public solverRegistry;
    bool public paused;
    LQCSourceEscrow public immutable sourceEscrow;
    uint256 private unlocked = 1;

    struct IntentRecord {
        address user;
        address sourceToken;
        uint256 sourceAmount;
        uint256 destinationChainId;
        address destinationToken;
        address recipient;
        uint256 minAmountOut;
        uint256 deadline;
        LQCIntentTypes.IntentStatus status;
        address solver;
        uint256 actualAmountOut;
        bytes32 destinationTxHash;
        bytes32 executionHash;
        bytes32 quoteHash;
        bytes32 routeHash;
    }

    mapping(bytes32 intentHash => IntentRecord) private records;
    mapping(address user => mapping(uint256 nonce => bool used)) public nonceUsed;

    event IntentSubmitted(bytes32 indexed intentHash, address indexed user, uint256 indexed nonce, uint256 deadline);
    event IntentCancelled(bytes32 indexed intentHash, address indexed user);
    event IntentExpired(bytes32 indexed intentHash, address indexed user);
    event IntentSettled(
        bytes32 indexed intentHash,
        address indexed solver,
        bytes32 indexed executionHash,
        bytes32 destinationTxHash,
        uint256 actualAmountOut
    );
    event SettlerUpdated(address indexed previousSettler, address indexed newSettler);
    event SettlerTransferStarted(address indexed currentSettler, address indexed pendingSettler);
    event GuardianUpdated(address indexed previousGuardian, address indexed newGuardian);
    event PauseUpdated(bool paused);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event OwnershipTransferStarted(address indexed currentOwner, address indexed pendingOwner);
    event InternalSolverTransferStarted(address indexed currentSolver, address indexed pendingSolver);
    event InternalSolverUpdated(address indexed previousSolver, address indexed newSolver);
    event QuoteManagerUpdated(address indexed previousManager, address indexed newManager);
    event SolverRegistryUpdated(address indexed previousRegistry, address indexed newRegistry);
    event SameChainIntentExecuted(
        bytes32 indexed intentHash,
        address indexed solver,
        bytes32 indexed dexId,
        bytes32 quoteHash,
        bytes32 executionHash,
        uint256 actualAmountOut
    );

    error Unauthorized();
    error ZeroAddress();
    error InvalidIntent();
    error InvalidSignature();
    error InvalidStatus();
    error NonceAlreadyUsed();
    error Expired();
    error NotExpired();
    error InsufficientOutput();
    error Paused();
    error Reentrancy();

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    modifier onlySettler() {
        if (msg.sender != settler) revert Unauthorized();
        _;
    }

    modifier nonReentrant() {
        if (unlocked != 1) revert Reentrancy();
        unlocked = 2;
        _;
        unlocked = 1;
    }

    constructor(address owner_, address settler_, address guardian_) {
        if (owner_ == address(0) || settler_ == address(0) || guardian_ == address(0)) revert ZeroAddress();
        owner = owner_;
        settler = settler_;
        guardian = guardian_;
        sourceEscrow = new LQCSourceEscrow();
    }

    function domainSeparator() public view returns (bytes32) {
        return keccak256(abi.encode(DOMAIN_TYPEHASH, NAME_HASH, VERSION_HASH, block.chainid, address(this)));
    }

    function hashIntent(LQCIntentTypes.Intent calldata intent) public view returns (bytes32) {
        return keccak256(abi.encodePacked("\x19\x01", domainSeparator(), _structHash(intent)));
    }

    function getIntent(bytes32 intentHash) external view returns (IntentRecord memory) {
        return records[intentHash];
    }

    function submitIntent(LQCIntentTypes.Intent calldata intent, bytes calldata signature)
        external
        nonReentrant
        returns (bytes32 intentHash)
    {
        if (paused) revert Paused();
        _validateIntent(intent);
        if (nonceUsed[intent.user][intent.nonce]) revert NonceAlreadyUsed();

        intentHash = hashIntent(intent);
        if (records[intentHash].status != LQCIntentTypes.IntentStatus.NONE) revert InvalidStatus();
        if (_recover(intentHash, signature) != intent.user) revert InvalidSignature();

        nonceUsed[intent.user][intent.nonce] = true;
        records[intentHash] = IntentRecord({
            user: intent.user,
            sourceToken: intent.sourceToken,
            sourceAmount: intent.sourceAmount,
            destinationChainId: intent.destinationChainId,
            destinationToken: intent.destinationToken,
            recipient: intent.recipient,
            minAmountOut: intent.minAmountOut,
            deadline: intent.deadline,
            status: LQCIntentTypes.IntentStatus.OPEN,
            solver: address(0),
            actualAmountOut: 0,
            destinationTxHash: bytes32(0),
            executionHash: bytes32(0),
            quoteHash: bytes32(0),
            routeHash: bytes32(0)
        });
        sourceEscrow.lockFrom(intentHash, intent.user, intent.sourceToken, intent.sourceAmount);

        emit IntentSubmitted(intentHash, intent.user, intent.nonce, intent.deadline);
    }

    function cancelIntent(bytes32 intentHash) external nonReentrant {
        IntentRecord storage record = records[intentHash];
        if (record.status != LQCIntentTypes.IntentStatus.OPEN) revert InvalidStatus();
        if (msg.sender != record.user) revert Unauthorized();
        record.status = LQCIntentTypes.IntentStatus.CANCELLED;
        sourceEscrow.refund(intentHash);
        emit IntentCancelled(intentHash, record.user);
    }

    function expireIntent(bytes32 intentHash) external nonReentrant {
        IntentRecord storage record = records[intentHash];
        if (record.status != LQCIntentTypes.IntentStatus.OPEN) revert InvalidStatus();
        if (block.timestamp <= record.deadline) revert NotExpired();
        record.status = LQCIntentTypes.IntentStatus.EXPIRED;
        sourceEscrow.refund(intentHash);
        emit IntentExpired(intentHash, record.user);
    }

    /// @notice Testnet bootstrap settlement. Replaced by SettlementHub + ExecutionVerifier later.
    function settleIntent(bytes32 intentHash, address solver, bytes32 destinationTxHash, uint256 actualAmountOut)
        external
        onlySettler
        nonReentrant
    {
        if (paused) revert Paused();
        if (solver == address(0) || destinationTxHash == bytes32(0)) revert InvalidIntent();
        IntentRecord storage record = records[intentHash];
        if (record.status != LQCIntentTypes.IntentStatus.OPEN) revert InvalidStatus();
        if (block.timestamp > record.deadline) revert Expired();
        if (actualAmountOut < record.minAmountOut) revert InsufficientOutput();

        bytes32 executionHash = keccak256(
            abi.encode(
                intentHash,
                solver,
                record.destinationChainId,
                record.destinationToken,
                record.recipient,
                actualAmountOut,
                destinationTxHash
            )
        );

        record.status = LQCIntentTypes.IntentStatus.EXECUTED;
        record.solver = solver;
        record.actualAmountOut = actualAmountOut;
        record.destinationTxHash = destinationTxHash;
        record.executionHash = executionHash;
        sourceEscrow.release(intentHash, solver);
        emit IntentSettled(intentHash, solver, executionHash, destinationTxHash, actualAmountOut);
    }

    /// @notice Gate-2 same-chain execution through the permissioned Router 2.0 Internal Solver.
    /// @dev Escrow release, Router execution and the final status update share one transaction.
    function executeSameChainIntent(
        bytes32 intentHash,
        LQCQuoteManager.SolverQuote calldata quote,
        bytes calldata quoteSignature,
        bytes calldata routeData
    )
        external
        onlySettler
        nonReentrant
        returns (uint256 actualAmountOut)
    {
        if (paused) revert Paused();
        address solver = internalSolver;
        LQCQuoteManager manager = quoteManager;
        if (solver == address(0) || address(manager) == address(0)) revert InvalidIntent();
        IntentRecord storage record = records[intentHash];
        if (record.status != LQCIntentTypes.IntentStatus.OPEN) revert InvalidStatus();
        if (record.destinationChainId != block.chainid) revert InvalidIntent();
        if (block.timestamp > record.deadline) revert Expired();

        bytes32 routeHash = keccak256(routeData);
        if (quote.solver == address(0) || quote.dexId == bytes32(0) || quote.routeHash != routeHash) revert InvalidIntent();
        LQCSolverRegistry registry = solverRegistry;
        if (address(registry) == address(0) || address(manager.solverRegistry()) != address(registry)) revert InvalidIntent();
        (bytes32 quoteHash, uint256 quotedNetAmountOut) =
            manager.verifyQuote(intentHash, record.minAmountOut, quote, quoteSignature);
        if (quotedNetAmountOut < record.minAmountOut || quote.deadline > record.deadline) revert InsufficientOutput();

        registry.openExposure(intentHash, quote.solver, quote.amountOut);
        sourceEscrow.release(intentHash, solver);
        actualAmountOut = ILQCInternalSolverExecution(solver).executeExactInput(
            intentHash,
            quote.dexId,
            record.sourceToken,
            record.destinationToken,
            record.sourceAmount,
            quote.amountOut,
            record.recipient,
            record.deadline,
            routeData
        );
        if (actualAmountOut < record.minAmountOut) revert InsufficientOutput();

        bytes32 executionHash =
            keccak256(abi.encode(intentHash, quote.solver, solver, block.chainid, quote.dexId, quoteHash, routeHash, actualAmountOut));
        record.status = LQCIntentTypes.IntentStatus.EXECUTED;
        record.solver = quote.solver;
        record.actualAmountOut = actualAmountOut;
        record.executionHash = executionHash;
        record.quoteHash = quoteHash;
        record.routeHash = routeHash;
        registry.closeExposure(intentHash);
        emit SameChainIntentExecuted(intentHash, quote.solver, quote.dexId, quoteHash, executionHash, actualAmountOut);
    }

    function setQuoteManager(address newManager) external onlyOwner {
        if (newManager == address(0)) revert ZeroAddress();
        if (newManager.code.length == 0) revert InvalidIntent();
        address previousManager = address(quoteManager);
        quoteManager = LQCQuoteManager(newManager);
        emit QuoteManagerUpdated(previousManager, newManager);
    }

    function setSolverRegistry(address newRegistry) external onlyOwner {
        if (newRegistry == address(0)) revert ZeroAddress();
        if (newRegistry.code.length == 0) revert InvalidIntent();
        address previousRegistry = address(solverRegistry);
        solverRegistry = LQCSolverRegistry(newRegistry);
        emit SolverRegistryUpdated(previousRegistry, newRegistry);
    }

    function setInternalSolver(address newSolver) external onlyOwner {
        if (newSolver == address(0)) revert ZeroAddress();
        if (newSolver.code.length == 0) revert InvalidIntent();
        try ILQCInternalSolverExecution(newSolver).intentHub() returns (address boundHub) {
            if (boundHub != address(this)) revert InvalidIntent();
        } catch {
            revert InvalidIntent();
        }
        try ILQCInternalSolverExecution(newSolver).executionRouter() returns (address boundRouter) {
            if (boundRouter == address(0) || boundRouter.code.length == 0) revert InvalidIntent();
        } catch {
            revert InvalidIntent();
        }
        pendingInternalSolver = newSolver;
        emit InternalSolverTransferStarted(internalSolver, newSolver);
    }

    function acceptInternalSolver() external {
        if (msg.sender != pendingInternalSolver) revert Unauthorized();
        address previousSolver = internalSolver;
        internalSolver = msg.sender;
        pendingInternalSolver = address(0);
        emit InternalSolverUpdated(previousSolver, msg.sender);
    }

    function setSettler(address newSettler) external onlyOwner {
        if (newSettler == address(0)) revert ZeroAddress();
        pendingSettler = newSettler;
        emit SettlerTransferStarted(settler, newSettler);
    }

    function acceptSettler() external {
        if (msg.sender != pendingSettler) revert Unauthorized();
        address previousSettler = settler;
        settler = msg.sender;
        pendingSettler = address(0);
        emit SettlerUpdated(previousSettler, msg.sender);
    }

    function setGuardian(address newGuardian) external onlyOwner {
        if (newGuardian == address(0)) revert ZeroAddress();
        emit GuardianUpdated(guardian, newGuardian);
        guardian = newGuardian;
    }

    function setPaused(bool value) external {
        if (value) {
            if (msg.sender != guardian && msg.sender != owner) revert Unauthorized();
        } else if (msg.sender != owner) {
            revert Unauthorized();
        }
        paused = value;
        emit PauseUpdated(value);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        pendingOwner = newOwner;
        emit OwnershipTransferStarted(owner, newOwner);
    }

    function acceptOwnership() external {
        if (msg.sender != pendingOwner) revert Unauthorized();
        address previousOwner = owner;
        owner = msg.sender;
        pendingOwner = address(0);
        emit OwnershipTransferred(previousOwner, msg.sender);
    }

    function _validateIntent(LQCIntentTypes.Intent calldata intent) private view {
        if (
            intent.user == address(0) || intent.sourceToken == address(0) || intent.destinationToken == address(0)
                || intent.recipient == address(0)
        ) revert ZeroAddress();
        if (
            intent.sourceAmount == 0 || intent.minAmountOut == 0 || intent.sourceChainId != block.chainid
                || intent.destinationChainId == 0 || intent.salt == bytes32(0)
        ) revert InvalidIntent();
        if (block.timestamp > intent.deadline) revert Expired();
    }

    function _structHash(LQCIntentTypes.Intent calldata intent) private pure returns (bytes32) {
        return keccak256(
            abi.encode(
                INTENT_TYPEHASH,
                intent.user,
                intent.sourceChainId,
                intent.sourceToken,
                intent.sourceAmount,
                intent.destinationChainId,
                intent.destinationToken,
                intent.recipient,
                intent.minAmountOut,
                intent.deadline,
                intent.nonce,
                intent.salt
            )
        );
    }

    function _recover(bytes32 digest, bytes calldata signature) private pure returns (address signer) {
        if (signature.length != 65) revert InvalidSignature();
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := calldataload(signature.offset)
            s := calldataload(add(signature.offset, 32))
            v := byte(0, calldataload(add(signature.offset, 64)))
        }
        if (uint256(s) > SECP256K1N_HALF || (v != 27 && v != 28)) revert InvalidSignature();
        signer = ecrecover(digest, v, r, s);
        if (signer == address(0)) revert InvalidSignature();
    }
}
