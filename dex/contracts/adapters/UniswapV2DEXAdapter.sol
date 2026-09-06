// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "../interfaces/IERC20.sol";
import {ILQCDEXAdapter} from "../interfaces/ILQCDEXAdapter.sol";
import {SafeTransferLib} from "../libraries/SafeTransferLib.sol";

interface IUniswapV2RouterLike {
    function getAmountsOut(uint256 amountIn, address[] calldata path)
        external
        view
        returns (uint256[] memory amounts);

    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external returns (uint256[] memory amounts);
}

/// @notice Adapter for PancakeSwap V2, Biswap, and compatible constant-product routers.
contract UniswapV2DEXAdapter is ILQCDEXAdapter {
    using SafeTransferLib for address;

    address public immutable aggregator;
    IUniswapV2RouterLike public immutable dexRouter;

    error Forbidden();
    error ZeroAddress();
    error InvalidPath();
    error ApprovalFailed();

    constructor(address aggregator_, address dexRouter_) {
        if (aggregator_ == address(0) || dexRouter_ == address(0)) revert ZeroAddress();
        aggregator = aggregator_;
        dexRouter = IUniswapV2RouterLike(dexRouter_);
    }

    function quoteExactInput(address tokenIn, address tokenOut, uint256 amountIn, bytes calldata routeData)
        external
        view
        returns (uint256 amountOut)
    {
        address[] memory path = _decodePath(tokenIn, tokenOut, routeData);
        uint256[] memory amounts = dexRouter.getAmountsOut(amountIn, path);
        return amounts[amounts.length - 1];
    }

    function swapExactInput(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOutMin,
        address recipient,
        bytes calldata routeData
    ) external returns (uint256 amountOut) {
        if (msg.sender != aggregator) revert Forbidden();
        address[] memory path = _decodePath(tokenIn, tokenOut, routeData);

        tokenIn.safeTransferFrom(msg.sender, address(this), amountIn);
        _forceApprove(tokenIn, address(dexRouter), amountIn);
        uint256[] memory amounts = dexRouter.swapExactTokensForTokens(
            amountIn, amountOutMin, path, recipient, block.timestamp
        );
        _forceApprove(tokenIn, address(dexRouter), 0);
        return amounts[amounts.length - 1];
    }

    function _decodePath(address tokenIn, address tokenOut, bytes calldata routeData)
        private
        pure
        returns (address[] memory path)
    {
        path = abi.decode(routeData, (address[]));
        if (path.length < 2 || path.length > 5 || path[0] != tokenIn || path[path.length - 1] != tokenOut) {
            revert InvalidPath();
        }
        for (uint256 i; i < path.length; ++i) {
            if (path[i] == address(0) || (i > 0 && path[i] == path[i - 1])) revert InvalidPath();
        }
    }

    function _forceApprove(address token, address spender, uint256 amount) private {
        (bool cleared, bytes memory clearData) = token.call(
            abi.encodeWithSelector(IERC20.approve.selector, spender, 0)
        );
        if (!cleared || (clearData.length != 0 && !abi.decode(clearData, (bool)))) revert ApprovalFailed();
        if (amount == 0) return;
        (bool approved, bytes memory approveData) = token.call(
            abi.encodeWithSelector(IERC20.approve.selector, spender, amount)
        );
        if (!approved || (approveData.length != 0 && !abi.decode(approveData, (bool)))) revert ApprovalFailed();
    }
}
