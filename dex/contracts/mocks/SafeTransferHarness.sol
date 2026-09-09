// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {SafeTransferLib} from "../libraries/SafeTransferLib.sol";

contract SafeTransferHarness {
    using SafeTransferLib for address;

    function pull(address token, address from, uint256 amount) external {
        token.safeTransferFrom(from, address(this), amount);
    }

    function push(address token, address to, uint256 amount) external {
        token.safeTransfer(to, amount);
    }

    function approveExact(address token, address spender, uint256 amount) external {
        token.forceApprove(spender, amount);
    }
}
