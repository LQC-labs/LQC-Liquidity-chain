// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ILQCDexAdapter} from "../interfaces/ILQCDexAdapter.sol";

/// @notice Quote-only adapter for the PancakeSwap V3 QuoterV2 interface.
/// @dev routeData is the packed V3 path: tokenIn | fee | token... | tokenOut.
contract PancakeV3Adapter is ILQCDexAdapter {
    bytes4 private constant QUOTE_EXACT_INPUT_SELECTOR = bytes4(keccak256("quoteExactInput(bytes,uint256)"));
    address public immutable quoterV2;

    error ZeroAddress();
    error InvalidRoute();
    error RouteEndpointMismatch();
    error QuoteFailed();

    constructor(address quoterV2_) {
        if (quoterV2_ == address(0)) revert ZeroAddress();
        quoterV2 = quoterV2_;
    }

    function quoteExactInput(address tokenIn, address tokenOut, uint256 amountIn, bytes calldata routeData)
        external
        view
        override
        returns (uint256 amountOut)
    {
        if (routeData.length < 43 || (routeData.length - 20) % 23 != 0) revert InvalidRoute();
        address first = address(bytes20(routeData[0:20]));
        address last = address(bytes20(routeData[routeData.length - 20:routeData.length]));
        if (first != tokenIn || last != tokenOut) revert RouteEndpointMismatch();

        (bool ok, bytes memory result) = quoterV2.staticcall(
            abi.encodeWithSelector(QUOTE_EXACT_INPUT_SELECTOR, routeData, amountIn)
        );
        if (!ok || result.length < 32) revert QuoteFailed();
        (amountOut,,,) = abi.decode(result, (uint256, uint160[], uint32[], uint256));
        if (amountOut == 0) revert QuoteFailed();
    }
}
