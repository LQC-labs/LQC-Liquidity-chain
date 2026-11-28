// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {SafeTransferLib} from "../libraries/SafeTransferLib.sol";
import {IWBNB} from "../interfaces/IWBNB.sol";
import {LQCExecutionRouter} from "./LQCExecutionRouter.sol";

interface IERC20NativeBalance { function balanceOf(address account) external view returns (uint256); }

/// @notice Wraps and unwraps native BNB around protected Router 2.0 token execution.
contract LQCNativeRouter {
    using SafeTransferLib for address;

    IWBNB public immutable wbnb;
    LQCExecutionRouter public immutable executionRouter;
    uint256 private unlocked = 1;

    event NativeSwapExecuted(address indexed sender, address indexed recipient, address indexed token, bool nativeIn, uint256 amountIn, uint256 amountOut);

    error ZeroAddress();
    error InvalidAmount();
    error UnsupportedToken();
    error NativeTransferFailed();
    error UnauthorizedNativeTransfer();
    error Reentrancy();

    modifier nonReentrant() {
        if (unlocked != 1) revert Reentrancy();
        unlocked = 2;
        _;
        unlocked = 1;
    }

    constructor(address wbnb_, address executionRouter_) {
        if (wbnb_ == address(0) || executionRouter_ == address(0)) revert ZeroAddress();
        wbnb = IWBNB(wbnb_);
        executionRouter = LQCExecutionRouter(executionRouter_);
    }

    receive() external payable {
        if (msg.sender != address(wbnb)) revert UnauthorizedNativeTransfer();
    }

    function swapExactNativeForToken(
        bytes32 dexId, address tokenOut, uint256 amountOutMinimum, address recipient,
        uint256 deadline, bytes calldata routeData
    ) external payable nonReentrant returns (uint256 amountOut) {
        if (msg.value == 0) revert InvalidAmount();
        if (tokenOut == address(0) || recipient == address(0)) revert ZeroAddress();
        wbnb.deposit{value: msg.value}();
        address(wbnb).forceApprove(address(executionRouter), msg.value);
        amountOut = executionRouter.swapExactInput(
            dexId, address(wbnb), tokenOut, msg.value, amountOutMinimum, recipient, deadline, routeData
        );
        address(wbnb).forceApprove(address(executionRouter), 0);
        if (wbnb.balanceOf(address(this)) != 0) revert UnsupportedToken();
        emit NativeSwapExecuted(msg.sender, recipient, tokenOut, true, msg.value, amountOut);
    }

    function swapExactTokenForNative(
        bytes32 dexId, address tokenIn, uint256 amountIn, uint256 amountOutMinimum,
        address payable recipient, uint256 deadline, bytes calldata routeData
    ) external nonReentrant returns (uint256 amountOut) {
        if (amountIn == 0 || amountOutMinimum == 0) revert InvalidAmount();
        if (tokenIn == address(0) || recipient == address(0)) revert ZeroAddress();
        uint256 inputBefore = IERC20NativeBalance(tokenIn).balanceOf(address(this));
        tokenIn.safeTransferFrom(msg.sender, address(this), amountIn);
        if (IERC20NativeBalance(tokenIn).balanceOf(address(this)) - inputBefore != amountIn) revert UnsupportedToken();
        tokenIn.forceApprove(address(executionRouter), amountIn);
        amountOut = executionRouter.swapExactInput(
            dexId, tokenIn, address(wbnb), amountIn, amountOutMinimum, address(this), deadline, routeData
        );
        tokenIn.forceApprove(address(executionRouter), 0);
        wbnb.withdraw(amountOut);
        (bool ok,) = recipient.call{value: amountOut}("");
        if (!ok) revert NativeTransferFailed();
        if (IERC20NativeBalance(tokenIn).balanceOf(address(this)) != inputBefore || wbnb.balanceOf(address(this)) != 0) {
            revert UnsupportedToken();
        }
        emit NativeSwapExecuted(msg.sender, recipient, tokenIn, false, amountIn, amountOut);
    }
}
