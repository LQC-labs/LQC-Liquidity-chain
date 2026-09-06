// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ILQCRiskGuard} from "../interfaces/ILQCRiskGuard.sol";

contract MockRiskGuard is ILQCRiskGuard {
    bool public blocked;
    function setBlocked(bool value) external { blocked = value; }
    function validateSwap(address, address) external view {
        if (blocked) revert("ORACLE_RISK");
    }
}
