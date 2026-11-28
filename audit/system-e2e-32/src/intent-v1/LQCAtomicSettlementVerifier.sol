// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {LQCSignedIntentHub} from "./LQCSignedIntentHub.sol";
import {LQCCoreIntentState} from "./LQCCoreIntentState.sol";
import {LQCExecutionReceipt} from "./LQCExecutionReceipt.sol";
import {ILQCInternalSolverIntent} from "./LQCIntentSolverBinding.sol";

/// @notice Finalizes evidence produced by one bound Signed Intent Hub in the same transaction.
contract LQCAtomicSettlementVerifier {
    bytes32 private constant SETTLEMENT_DOMAIN = keccak256("LQC Atomic Settlement V1");

    struct Verification {
        bytes32 intentHash;
        bytes32 receiptHash;
        bytes32 quoteHash;
        address selectedSolver;
        uint256 amountOut;
    }

    LQCSignedIntentHub public immutable hub;
    mapping(bytes32 => bytes32) public settlementForIntent;
    mapping(bytes32 => bytes32) public settlementForReceipt;
    mapping(bytes32 => Verification) public verifications;

    error UnauthorizedHub();
    error InvalidEvidence();
    error AlreadyFinalized();

    event SettlementVerified(bytes32 indexed settlementId, bytes32 indexed intentHash,
        bytes32 indexed receiptHash, address solver, uint256 amountOut);

    constructor(LQCSignedIntentHub hub_) {
        if (address(hub_) == address(0)) revert InvalidEvidence();
        hub = hub_;
    }

    /// @dev Output is read from the canonical Receipt and must match the Hub's measured commitment.
    function finalize(LQCSignedIntentHub.Order calldata order, ILQCInternalSolverIntent.RouteIntent calldata route)
        external returns (bytes32 settlementId)
    {
        if (msg.sender != address(hub)) revert UnauthorizedHub();
        bytes32 intentHash = route.intentHash;
        if (settlementForIntent[intentHash] != bytes32(0)) revert AlreadyFinalized();
        bytes32 quoteHash = _verifyOrder(order, route);
        (bytes32 receiptHash, uint256 amountOut) = _verifyReceipt(order, route, quoteHash);

        settlementId = keccak256(abi.encode(SETTLEMENT_DOMAIN, block.chainid, address(this),
            address(hub), intentHash, receiptHash));
        if (settlementForReceipt[receiptHash] != bytes32(0) ||
            verifications[settlementId].intentHash != bytes32(0)) revert AlreadyFinalized();
        settlementForIntent[intentHash] = settlementId;
        settlementForReceipt[receiptHash] = settlementId;
        verifications[settlementId] = Verification(intentHash, receiptHash, quoteHash, order.selectedSolver, amountOut);

        emit SettlementVerified(settlementId, intentHash, receiptHash, order.selectedSolver, amountOut);
    }

    function _verifyOrder(LQCSignedIntentHub.Order calldata order, ILQCInternalSolverIntent.RouteIntent calldata route)
        private view returns (bytes32 quoteHash)
    {
        bytes32 hash = route.intentHash;
        if (hash == bytes32(0) || hub.digest(order, route) != hash) revert InvalidEvidence();
        LQCCoreIntentState.IntentRecord memory record = hub.escrow().intentRecord(hash);
        if (record.status != LQCCoreIntentState.IntentStatus.Executed || record.sender != order.user ||
            record.nonce != order.nonce || record.deadline != route.deadline ||
            hub.escrow().intentForNonce(order.user, order.nonce) != hash) revert InvalidEvidence();
        quoteHash = hub.quoteHash(order, route);
        (address solver, bytes32 assignedQuote,, uint256 expiry, bool consumed) = hub.assignments().assignments(hash);
        if (!consumed || solver != order.selectedSolver || assignedQuote != quoteHash ||
            expiry != order.quoteExpiry || expiry < block.timestamp || route.deadline < block.timestamp) {
            revert InvalidEvidence();
        }
    }

    function _verifyReceipt(LQCSignedIntentHub.Order calldata order,
        ILQCInternalSolverIntent.RouteIntent calldata route, bytes32 quoteHash)
        private view returns (bytes32 receiptHash, uint256 amountOut)
    {
        bytes32 hash = route.intentHash;
        LQCExecutionReceipt receipt = hub.receipt();
        if (receipt.recorder() != address(hub.binding())) revert InvalidEvidence();
        (bytes32 executed, address solver, bytes32 dexId, uint256 received, uint256 recordedAt) = receipt.receipts(hash);
        if (executed != hub.binding().executionHash(route) || solver != hub.internalSolver() ||
            dexId != route.dexId || recordedAt != block.timestamp ||
            received == 0 || received < route.amountOutMinimum) revert InvalidEvidence();

        receiptHash = receipt.getReceiptHash(hash);
        bytes32 expected = keccak256(abi.encode(hash, quoteHash, order.selectedSolver, receiptHash, received));
        if (hub.settlements(hash) != expected) revert InvalidEvidence();
        amountOut = received;
    }
}
