// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {LQCSettledIntentHub} from "./LQCSettledIntentHub.sol";
import {LQCSignedIntentEscrow} from "./LQCSignedIntentEscrow.sol";
import {LQCIntentSolverBinding, ILQCInternalSolverIntent} from "./LQCIntentSolverBinding.sol";
import {LQCSolverAssignment} from "./LQCSolverAssignment.sol";
import {LQCSolverRegistry} from "./LQCSolverRegistry.sol";
import {LQCSolverBondVault} from "./LQCSolverBondVault.sol";
import {LQCSolverReputation} from "./LQCSolverReputation.sol";
import {LQCSolverQuoteBook} from "./LQCSolverQuoteBook.sol";

contract LQCCompetitiveIntentHub is LQCSettledIntentHub {
    LQCSolverQuoteBook public immutable quoteBook;

    constructor(LQCSignedIntentEscrow escrow_, LQCIntentSolverBinding binding_, LQCSolverAssignment assignments_,
        LQCSolverRegistry registry_, LQCSolverBondVault vault_, LQCSolverReputation reputation_,
        address owner_, address guardian_)
        LQCSettledIntentHub(escrow_, binding_, assignments_, registry_, owner_, guardian_)
    {
        quoteBook = new LQCSolverQuoteBook(this, registry_, assignments_, vault_, reputation_, router);
    }

    function _beforeExecution(Order calldata order, ILQCInternalSolverIntent.RouteIntent calldata route)
        internal view override
    {
        quoteBook.validateExecution(route.intentHash, order.selectedSolver);
    }
}
