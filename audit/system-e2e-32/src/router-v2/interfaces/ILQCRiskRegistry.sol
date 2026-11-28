// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface ILQCRiskRegistry {
    function consumeSwap(
        address tokenIn,
        address tokenOut,
        bytes32[] calldata dexIds,
        uint256[] calldata amountsIn
    ) external;
}
