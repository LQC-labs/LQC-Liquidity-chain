// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ILQCDexAdapter} from "./ILQCDexAdapter.sol";

/// @notice Execution surface for reviewed Router 2.0 adapters.
interface ILQCExecutionAdapter is ILQCDexAdapter {
    function supportsExecution() external pure returns (bool);

    function executeExactInput(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOutMinimum,
        address recipient,
        uint256 deadline,
        bytes calldata routeData
    ) external returns (uint256 amountOut);
}
