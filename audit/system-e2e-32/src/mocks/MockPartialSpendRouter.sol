// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {SafeTransferLib} from "../libraries/SafeTransferLib.sol";

/// @dev Adversarial router that reports success after consuming only half of the approved input.
contract MockPartialSpendRouter {
    using SafeTransferLib for address;

    function getAmountsOut(uint256 amountIn, address[] calldata path)
        external pure returns (uint256[] memory amounts)
    {
        amounts = new uint256[](path.length);
        amounts[0] = amountIn;
        amounts[path.length - 1] = amountIn;
    }

    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256,
        address[] calldata path,
        address to,
        uint256
    ) external returns (uint256[] memory amounts) {
        path[0].safeTransferFrom(msg.sender, address(this), amountIn / 2);
        path[path.length - 1].safeTransfer(to, amountIn);
        amounts = new uint256[](path.length);
        amounts[0] = amountIn;
        amounts[path.length - 1] = amountIn;
    }
}
