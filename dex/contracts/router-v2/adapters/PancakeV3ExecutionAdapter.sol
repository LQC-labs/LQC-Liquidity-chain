// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ILQCExecutionAdapter} from "../interfaces/ILQCExecutionAdapter.sol";
import {SafeTransferLib} from "../../libraries/SafeTransferLib.sol";

interface IPancakeV3SwapRouter {
    struct ExactInputParams { bytes path; address recipient; uint256 amountIn; uint256 amountOutMinimum; }
    function exactInput(ExactInputParams calldata params) external payable returns (uint256 amountOut);
}

/// @notice Reviewed token-to-token quote and execution adapter for PancakeSwap V3.
/// @dev routeData is the packed V3 path: tokenIn | fee | token... | tokenOut.
contract PancakeV3ExecutionAdapter is ILQCExecutionAdapter {
    using SafeTransferLib for address;

    bytes4 private constant QUOTE_EXACT_INPUT_SELECTOR = bytes4(keccak256("quoteExactInput(bytes,uint256)"));
    address public immutable quoterV2;
    IPancakeV3SwapRouter public immutable swapRouter;

    error ZeroAddress();
    error InvalidRoute();
    error RouteEndpointMismatch();
    error QuoteFailed();
    error Expired();
    error InsufficientOutput();

    constructor(address quoterV2_, address swapRouter_) {
        if (quoterV2_ == address(0) || swapRouter_ == address(0)) revert ZeroAddress();
        quoterV2 = quoterV2_;
        swapRouter = IPancakeV3SwapRouter(swapRouter_);
    }

    function supportsExecution() external pure override returns (bool) { return true; }

    function quoteExactInput(address tokenIn, address tokenOut, uint256 amountIn, bytes calldata routeData)
        external view override returns (uint256 amountOut)
    {
        _validateRoute(tokenIn, tokenOut, routeData);
        (bool ok, bytes memory result) = quoterV2.staticcall(
            abi.encodeWithSelector(QUOTE_EXACT_INPUT_SELECTOR, routeData, amountIn)
        );
        if (!ok || result.length < 32) revert QuoteFailed();
        (amountOut,,,) = abi.decode(result, (uint256, uint160[], uint32[], uint256));
        if (amountOut == 0) revert QuoteFailed();
    }

    function executeExactInput(
        address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOutMinimum,
        address recipient, uint256 deadline, bytes calldata routeData
    ) external override returns (uint256 amountOut) {
        if (block.timestamp > deadline) revert Expired();
        _validateRoute(tokenIn, tokenOut, routeData);
        tokenIn.safeTransferFrom(msg.sender, address(this), amountIn);
        tokenIn.forceApprove(address(swapRouter), amountIn);
        amountOut = swapRouter.exactInput(IPancakeV3SwapRouter.ExactInputParams({
            path: routeData, recipient: recipient, amountIn: amountIn, amountOutMinimum: amountOutMinimum
        }));
        tokenIn.forceApprove(address(swapRouter), 0);
        if (amountOut < amountOutMinimum) revert InsufficientOutput();
    }

    function _validateRoute(address tokenIn, address tokenOut, bytes calldata routeData) private pure {
        if (routeData.length < 43 || (routeData.length - 20) % 23 != 0) revert InvalidRoute();
        address first = address(bytes20(routeData[0:20]));
        address last = address(bytes20(routeData[routeData.length - 20:routeData.length]));
        if (first != tokenIn || last != tokenOut) revert RouteEndpointMismatch();
    }
}
