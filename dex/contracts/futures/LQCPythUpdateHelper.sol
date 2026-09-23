// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IPyth} from "./interfaces/IPyth.sol";

/// @notice Permissionless helper that submits signed Pyth updates.
/// @dev Has no pricing/governance authority. Excess msg.value is refunded.
contract LQCPythUpdateHelper {
    IPyth public immutable pyth;

    event PriceFeedsUpdated(address indexed caller, uint256 updateCount, uint256 feePaid);

    error InvalidAddress();
    error EmptyUpdateData();
    error InsufficientValue();
    error RefundFailed();

    constructor(address pyth_) {
        if (pyth_ == address(0)) revert InvalidAddress();
        pyth = IPyth(pyth_);
    }

    function update(bytes[] calldata updateData) external payable returns (uint256 feePaid) {
        if (updateData.length == 0) revert EmptyUpdateData();

        feePaid = pyth.getUpdateFee(updateData);
        if (msg.value < feePaid) revert InsufficientValue();

        pyth.updatePriceFeeds{value: feePaid}(updateData);

        uint256 refund = msg.value - feePaid;
        if (refund != 0) {
            (bool ok,) = payable(msg.sender).call{value: refund}("");
            if (!ok) revert RefundFailed();
        }

        emit PriceFeedsUpdated(msg.sender, updateData.length, feePaid);
    }
}
