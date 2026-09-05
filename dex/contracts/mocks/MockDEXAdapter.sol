// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ILQCDEXAdapter} from "../interfaces/ILQCDEXAdapter.sol";
import {SafeTransferLib} from "../libraries/SafeTransferLib.sol";

contract MockDEXAdapter is ILQCDEXAdapter {
    using SafeTransferLib for address;

    uint256 public immutable quoteNumerator;
    uint256 public immutable swapNumerator;
    uint256 public immutable denominator;
    bool public quoteReverts;

    constructor(uint256 quoteNumerator_, uint256 swapNumerator_, uint256 denominator_) {
        quoteNumerator = quoteNumerator_;
        swapNumerator = swapNumerator_;
        denominator = denominator_;
    }

    function setQuoteReverts(bool value) external {
        quoteReverts = value;
    }

    function quoteExactInput(address, address, uint256 amountIn, bytes calldata)
        external
        view
        returns (uint256 amountOut)
    {
        if (quoteReverts) revert();
        return amountIn * quoteNumerator / denominator;
    }

    function swapExactInput(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256,
        address recipient,
        bytes calldata
    ) external returns (uint256 amountOut) {
        tokenIn.safeTransferFrom(msg.sender, address(this), amountIn);
        amountOut = amountIn * swapNumerator / denominator;
        tokenOut.safeTransfer(recipient, amountOut);
    }
}
