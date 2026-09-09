// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {MockERC20} from "./MockERC20.sol";

/// @dev Audit-only token that can arbitrarily change an account's balance.
contract MockRebasingToken is MockERC20 {
    constructor(string memory name_, string memory symbol_) MockERC20(name_, symbol_) {}

    function increaseBalance(address account, uint256 amount) external {
        totalSupply += amount;
        balanceOf[account] += amount;
        emit Transfer(address(0), account, amount);
    }

    function decreaseBalance(address account, uint256 amount) external {
        balanceOf[account] -= amount;
        totalSupply -= amount;
        emit Transfer(account, address(0), amount);
    }
}
