// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {LQCSourceEscrow} from "./LQCSourceEscrow.sol";
import {SafeTransferLib} from "../libraries/SafeTransferLib.sol";

interface IERC20SignedEscrowBalance {
    function balanceOf(address account) external view returns (uint256);
}

/// @notice Dedicated custody for a signed-only Hub. The legacy Escrow remains independently usable.
contract LQCSignedIntentEscrow is LQCSourceEscrow {
    using SafeTransferLib for address;
    error SignedPathOnly();
    error InexactDeposit();

    constructor(address hub) LQCSourceEscrow(hub) {}

    function lock(bytes32, address, uint256, uint256, uint256) external pure override { revert SignedPathOnly(); }
    function release(bytes32, address) external pure override { revert SignedPathOnly(); }

    function lockSignedFor(bytes32 hash, address user, address token, uint256 amount, uint256 nonce, uint256 deadline)
        external onlyHub nonReentrant
    {
        if (token.code.length == 0) revert InvalidToken();
        if (amount == 0) revert InvalidAmount();
        _registerIntent(hash, user, nonce, deadline);
        escrows[hash] = Escrow(token, amount);
        uint256 beforeBalance = IERC20SignedEscrowBalance(token).balanceOf(address(this));
        uint256 beforeUser = IERC20SignedEscrowBalance(token).balanceOf(user);
        token.safeTransferFrom(user, address(this), amount);
        if (IERC20SignedEscrowBalance(token).balanceOf(address(this)) != beforeBalance + amount ||
            beforeUser < amount || IERC20SignedEscrowBalance(token).balanceOf(user) != beforeUser - amount) {
            revert InexactDeposit();
        }
    }
}
