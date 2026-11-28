// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {LQCSignedIntentEscrow, IERC20SignedEscrowBalance} from "./LQCSignedIntentEscrow.sol";
import {LQCIntentSolverBinding, ILQCInternalSolverIntent} from "./LQCIntentSolverBinding.sol";
import {LQCInternalSolver} from "./LQCInternalSolver.sol";
import {LQCSolverAssignment} from "./LQCSolverAssignment.sol";
import {LQCSolverRegistry} from "./LQCSolverRegistry.sol";
import {LQCExecutionReceipt} from "./LQCExecutionReceipt.sol";
import {LQCRiskRegistry} from "../router-v2/LQCRiskRegistry.sol";
import {LQCExecutionRouter} from "../router-v2/LQCExecutionRouter.sol";

interface IIntentContractSigner {
    function isValidSignature(bytes32 digest, bytes calldata signature) external view returns (bytes4);
}

/// @notice Signed-only same-chain settlement. The assigned solver submits; the bound Internal Solver executes.
contract LQCSignedIntentHub {
    bytes32 private constant DOMAIN_TYPE = keccak256(
        "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
    );
    bytes32 private constant INTENT_TYPE = keccak256(
        "ExecutionIntent(bytes32 proofHash,address sender,address target,bytes32 calldataHash,uint256 value,uint256 nonce,uint256 deadline)"
    );
    bytes32 private constant QUOTE_DOMAIN = keccak256("LQC Signed Route Quote V1");
    uint256 private constant MAX_S = 0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0;

    struct Order {
        address user;
        uint256 nonce;
        address selectedSolver;
        address adapter;
        uint256 quoteExpiry;
    }

    LQCSignedIntentEscrow public immutable escrow;
    LQCIntentSolverBinding public immutable binding;
    LQCSolverAssignment public immutable assignments;
    LQCSolverRegistry public immutable solverRegistry;
    LQCExecutionReceipt public immutable receipt;
    LQCExecutionRouter public immutable router;
    address public immutable internalSolver;
    address public immutable owner;
    address public immutable guardian;
    mapping(bytes32 => bytes32) public settlements;
    bool public paused;
    uint256 private entered;
    uint256 public restrictionEpoch;

    error InvalidBinding();
    error InvalidIntent();
    error InvalidSignature();
    error WrongSolver();
    error IneligibleSolver();
    error InvalidQuote();
    error InvalidSettlement();
    error Reentrancy();
    error Unauthorized();
    error Paused();

    event IntentSettled(bytes32 indexed intentHash, address indexed selectedSolver, bytes32 indexed receiptHash,
        bytes32 quoteHash, bytes32 settlementHash, uint256 amountOut);
    event PauseChanged(bool paused);

    constructor(LQCSignedIntentEscrow escrow_, LQCIntentSolverBinding binding_, LQCSolverAssignment assignments_,
        LQCSolverRegistry solverRegistry_, address owner_, address guardian_)
    {
        LQCInternalSolver solver = LQCInternalSolver(address(binding_.solver()));
        LQCExecutionRouter router_ = LQCExecutionRouter(address(solver.executionRouter()));
        if (escrow_.intentHub() != address(this) || binding_.intentHub() != address(this) ||
            address(binding_.escrow()) != address(escrow_) || solver.executionBinding() != address(binding_) ||
            address(router_.riskRegistry()) == address(0) || address(assignments_).code.length == 0 ||
            address(solverRegistry_).code.length == 0 || owner_ == address(0) || guardian_ == address(0)) {
            revert InvalidBinding();
        }
        escrow = escrow_;
        binding = binding_;
        assignments = assignments_;
        solverRegistry = solverRegistry_;
        receipt = LQCExecutionReceipt(address(binding_.receipt()));
        router = router_;
        internalSolver = address(solver);
        owner = owner_;
        guardian = guardian_;
    }

    modifier nonReentrant() {
        if (entered != 0) revert Reentrancy();
        entered = 1;
        _;
        entered = 0;
    }

    function setPaused(bool value) external {
        if (!value || (msg.sender != owner && msg.sender != guardian)) revert Unauthorized();
        paused = true;
        ++restrictionEpoch;
        emit PauseChanged(true);
    }

    function recoverExecution(bytes32 expectedEpoch, uint256 deadline) external {
        if (msg.sender != owner) revert Unauthorized();
        if (!paused || executionEpoch() != expectedEpoch || block.timestamp > deadline) revert InvalidIntent();
        // DEX and Solver must first restore their own native controls.
        if (solverRegistry.paused() || LQCRiskRegistry(address(router.riskRegistry())).swapsPaused()) revert Paused();
        paused = false;
        ++restrictionEpoch;
        emit PauseChanged(false);
    }

    /// @dev The calldata commitment excludes the digest itself, avoiding a circular commitment.
    function routeHash(Order calldata order, ILQCInternalSolverIntent.RouteIntent calldata route)
        public pure returns (bytes32)
    {
        return keccak256(abi.encode(route.dexId, order.adapter, route.tokenIn, route.tokenOut,
            route.amountIn, route.amountOutMinimum, route.recipient, route.deadline, keccak256(route.routeData)));
    }

    function executionEpoch() public view returns (bytes32) {
        return keccak256(abi.encode(restrictionEpoch, solverRegistry.restrictionEpoch(), LQCRiskRegistry(address(router.riskRegistry())).recoveryEpoch()));
    }

    function executionPaused() public view returns (bool) {
        return paused || solverRegistry.paused() || LQCRiskRegistry(address(router.riskRegistry())).swapsPaused();
    }

    function quoteHash(Order calldata order, ILQCInternalSolverIntent.RouteIntent calldata route)
        public view returns (bytes32)
    {
        return keccak256(abi.encode(QUOTE_DOMAIN, routeHash(order, route), order.selectedSolver, order.quoteExpiry, executionEpoch()));
    }

    function digest(Order calldata order, ILQCInternalSolverIntent.RouteIntent calldata route)
        public view returns (bytes32)
    {
        bytes32 domain = keccak256(abi.encode(DOMAIN_TYPE, keccak256("LQC Execution Intent"), keccak256("1"),
            block.chainid, address(this)));
        bytes32 payload = keccak256(abi.encode(INTENT_TYPE, quoteHash(order, route), order.user, address(router),
            routeHash(order, route), uint256(0), order.nonce, route.deadline));
        return keccak256(abi.encodePacked(hex"1901", domain, payload));
    }

    function execute(Order calldata order, ILQCInternalSolverIntent.RouteIntent calldata route, bytes calldata signature)
        external nonReentrant returns (uint256 amountOut, bytes32 receiptHash)
    {
        if (executionPaused()) revert Paused();
        if (msg.sender != order.selectedSolver) revert WrongSolver();
        if (order.user == address(0) || route.recipient == address(0) || route.tokenIn == route.tokenOut ||
            route.amountIn == 0 || route.amountOutMinimum == 0 || route.deadline <= block.timestamp ||
            order.quoteExpiry > route.deadline || order.quoteExpiry < block.timestamp) revert InvalidIntent();
        bytes32 hash = digest(order, route);
        if (route.intentHash != hash || !_validSignature(order.user, hash, signature)) revert InvalidSignature();
        _checkQuote(order, route);
        _beforeExecution(order, route);
        bytes32 selectedQuote = quoteHash(order, route);
        _consumeAssignment(hash, selectedQuote, order);
        (amountOut, receiptHash) = _executeAndVerify(hash, order, route);
        bytes32 commitment = keccak256(abi.encode(hash, selectedQuote, order.selectedSolver, receiptHash, amountOut));
        settlements[hash] = commitment;
        _afterSettlement(order, route);
        emit IntentSettled(hash, order.selectedSolver, receiptHash, selectedQuote, commitment, amountOut);
    }

    function _beforeExecution(Order calldata, ILQCInternalSolverIntent.RouteIntent calldata) internal view virtual {}

    function _afterSettlement(Order calldata, ILQCInternalSolverIntent.RouteIntent calldata) internal virtual {}

    function _checkQuote(Order calldata order, ILQCInternalSolverIntent.RouteIntent calldata route) private view {
        (address adapter, bool enabled,) = router.registry().getDex(route.dexId);
        if (!enabled || adapter != order.adapter || adapter.code.length == 0) revert InvalidQuote();
    }

    function _consumeAssignment(bytes32 hash, bytes32 selectedQuote, Order calldata order) private {
        (uint256 bond, uint256 exposure, bool active) = solverRegistry.solvers(order.selectedSolver);
        if (solverRegistry.paused() || !active || bond < solverRegistry.minimumBond() ||
            exposure >= bond || exposure >= solverRegistry.exposureLimit()) revert IneligibleSolver();
        (,,, uint256 expiresAt,) = assignments.assignments(hash);
        if (expiresAt != order.quoteExpiry) revert InvalidQuote();
        assignments.consume(hash, order.selectedSolver, selectedQuote);
    }

    function _executeAndVerify(bytes32 hash, Order calldata order, ILQCInternalSolverIntent.RouteIntent calldata route)
        private returns (uint256 amountOut, bytes32 receiptHash)
    {
        IERC20SignedEscrowBalance output = IERC20SignedEscrowBalance(route.tokenOut);
        uint256 initial = output.balanceOf(route.recipient);
        escrow.lockSignedFor(hash, order.user, route.tokenIn, route.amountIn, order.nonce, route.deadline);
        bytes memory response = escrow.executeThrough(hash, address(binding),
            abi.encodeCall(binding.forward, (hash, order.user, order.nonce, route)));
        (amountOut, receiptHash) = abi.decode(response, (uint256, bytes32));
        uint256 finalBalance = output.balanceOf(route.recipient);
        if (finalBalance < initial || finalBalance - initial != amountOut || amountOut < route.amountOutMinimum ||
            !receipt.verify(hash, binding.executionHash(route), internalSolver, route.dexId, amountOut, block.timestamp) ||
            receipt.getReceiptHash(hash) != receiptHash || settlements[hash] != bytes32(0)) revert InvalidSettlement();
        _checkQuote(order, route);
    }

    function _validSignature(address user, bytes32 hash, bytes calldata signature) private view returns (bool) {
        if (user.code.length != 0) {
            try IIntentContractSigner(user).isValidSignature(hash, signature) returns (bytes4 result) {
                return result == IIntentContractSigner.isValidSignature.selector;
            } catch { return false; }
        }
        if (signature.length != 65) return false;
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly ("memory-safe") {
            r := calldataload(signature.offset)
            s := calldataload(add(signature.offset, 32))
            v := byte(0, calldataload(add(signature.offset, 64)))
        }
        return uint256(s) <= MAX_S && (v == 27 || v == 28) && ecrecover(hash, v, r, s) == user;
    }
}
