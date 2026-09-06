// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {SafeTransferLib} from "../libraries/SafeTransferLib.sol";

contract MockV3SwapRouter {
    using SafeTransferLib for address;
    struct ExactInputParams { bytes path; address recipient; uint256 amountIn; uint256 amountOutMinimum; }
    uint256 public immutable multiplier;

    constructor(uint256 multiplier_) { multiplier = multiplier_; }

    function exactInput(ExactInputParams calldata params) external payable returns (uint256 amountOut) {
        address tokenIn = address(bytes20(params.path[0:20]));
        address tokenOut = address(bytes20(params.path[params.path.length - 20:params.path.length]));
        amountOut = params.amountIn * multiplier;
        require(amountOut >= params.amountOutMinimum, "minimum output");
        tokenIn.safeTransferFrom(msg.sender, address(this), params.amountIn);
        tokenOut.safeTransfer(params.recipient, amountOut);
    }
}
