// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {LQCSignedIntentHub} from "./LQCSignedIntentHub.sol";
import {LQCSignedIntentEscrow} from "./LQCSignedIntentEscrow.sol";
import {LQCIntentSolverBinding, ILQCInternalSolverIntent} from "./LQCIntentSolverBinding.sol";
import {LQCSolverAssignment} from "./LQCSolverAssignment.sol";
import {LQCSolverRegistry} from "./LQCSolverRegistry.sol";
import {LQCAtomicSettlementVerifier} from "./LQCAtomicSettlementVerifier.sol";

/// @notice Signed-only Hub with mandatory atomic settlement verification.
contract LQCSettledIntentHub is LQCSignedIntentHub {
    LQCAtomicSettlementVerifier public immutable settlementVerifier;

    constructor(LQCSignedIntentEscrow escrow_, LQCIntentSolverBinding binding_, LQCSolverAssignment assignments_,
        LQCSolverRegistry solverRegistry_, address owner_, address guardian_)
        LQCSignedIntentHub(escrow_, binding_, assignments_, solverRegistry_, owner_, guardian_)
    {
        settlementVerifier = new LQCAtomicSettlementVerifier(this);
    }

    function _afterSettlement(Order calldata order, ILQCInternalSolverIntent.RouteIntent calldata route) internal virtual override {
        settlementVerifier.finalize(order, route);
    }
}
