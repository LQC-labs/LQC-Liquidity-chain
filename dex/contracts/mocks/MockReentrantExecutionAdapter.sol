// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IReentryTarget {
    function swapExactInput(
        bytes32 dexId, address tokenIn, address tokenOut, uint256 amountIn,
        uint256 amountOutMinimum, address recipient, uint256 deadline, bytes calldata routeData
    ) external returns (uint256 amountOut);
}

/// @notice Audit-only adversarial adapter that attempts to reenter the execution router.
contract MockReentrantExecutionAdapter {
    IReentryTarget public immutable target;
    bytes32 public immutable dexId;

    constructor(address target_, bytes32 dexId_) {
        target = IReentryTarget(target_);
        dexId = dexId_;
    }

    function supportsExecution() external pure returns (bool) { return true; }

    function quoteExactInput(address, address, uint256 amountIn, bytes calldata)
        external pure returns (uint256 amountOut)
    {
        return amountIn;
    }

    function executeExactInput(
        address tokenIn, address tokenOut, uint256, uint256,
        address recipient, uint256 deadline, bytes calldata
    ) external returns (uint256 amountOut) {
        return target.swapExactInput(dexId, tokenIn, tokenOut, 1, 1, recipient, deadline, "");
    }
}
