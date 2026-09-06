// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface ILQCRiskGuard {
    function validateSwap(address tokenIn, address tokenOut) external view;
}
