// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract MockV3Quoter {
    uint256 public immutable multiplier;

    constructor(uint256 multiplier_) {
        multiplier = multiplier_;
    }

    function quoteExactInput(bytes calldata, uint256 amountIn)
        external
        view
        returns (
            uint256 amountOut,
            uint160[] memory sqrtPriceX96AfterList,
            uint32[] memory initializedTicksCrossedList,
            uint256 gasEstimate
        )
    {
        amountOut = amountIn * multiplier;
        sqrtPriceX96AfterList = new uint160[](1);
        initializedTicksCrossedList = new uint32[](1);
        gasEstimate = 120_000;
    }
}
