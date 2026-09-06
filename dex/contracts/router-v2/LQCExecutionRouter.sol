// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {SafeTransferLib} from "../libraries/SafeTransferLib.sol";
import {ILQCDexRegistry} from "./interfaces/ILQCDexRegistry.sol";
import {ILQCExecutionAdapter} from "./interfaces/ILQCExecutionAdapter.sol";

interface IERC20Balance {
    function balanceOf(address account) external view returns (uint256);
}

/// @notice Executes an exact-input swap only through an enabled, reviewed registry adapter.
/// @dev Token-only MVP. Native BNB and fee-on-transfer tokens remain intentionally unsupported.
contract LQCExecutionRouter {
    using SafeTransferLib for address;

    ILQCDexRegistry public immutable registry;
    uint256 private unlocked = 1;

    event SwapExecuted(
        address indexed sender,
        bytes32 indexed dexId,
        address indexed recipient,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOut
    );

    error ZeroAddress();
    error InvalidTokens();
    error InvalidAmount();
    error Expired();
    error DexDisabled();
    error InsufficientOutput();
    error UnsupportedToken();
    error Reentrancy();

    modifier nonReentrant() {
        if (unlocked != 1) revert Reentrancy();
        unlocked = 2;
        _;
        unlocked = 1;
    }

    constructor(address registry_) {
        if (registry_ == address(0)) revert ZeroAddress();
        registry = ILQCDexRegistry(registry_);
    }

    function swapExactInput(
        bytes32 dexId,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOutMinimum,
        address recipient,
        uint256 deadline,
        bytes calldata routeData
    ) external nonReentrant returns (uint256 amountOut) {
        if (tokenIn == address(0) || tokenOut == address(0) || recipient == address(0)) revert ZeroAddress();
        if (tokenIn == tokenOut) revert InvalidTokens();
        if (amountIn == 0 || amountOutMinimum == 0) revert InvalidAmount();
        if (block.timestamp > deadline) revert Expired();

        (address adapter, bool enabled,) = registry.getDex(dexId);
        if (!enabled || adapter == address(0)) revert DexDisabled();

        uint256 routerBefore = IERC20Balance(tokenIn).balanceOf(address(this));
        tokenIn.safeTransferFrom(msg.sender, address(this), amountIn);
        if (IERC20Balance(tokenIn).balanceOf(address(this)) - routerBefore != amountIn) revert UnsupportedToken();

        uint256 recipientBefore = IERC20Balance(tokenOut).balanceOf(recipient);
        tokenIn.forceApprove(adapter, amountIn);
        ILQCExecutionAdapter(adapter).executeExactInput(
            tokenIn, tokenOut, amountIn, amountOutMinimum, recipient, deadline, routeData
        );
        tokenIn.forceApprove(adapter, 0);

        amountOut = IERC20Balance(tokenOut).balanceOf(recipient) - recipientBefore;
        if (amountOut < amountOutMinimum) revert InsufficientOutput();
        if (IERC20Balance(tokenIn).balanceOf(address(this)) != routerBefore) revert UnsupportedToken();

        emit SwapExecuted(msg.sender, dexId, recipient, tokenIn, tokenOut, amountIn, amountOut);
    }
}
