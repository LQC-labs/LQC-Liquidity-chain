// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "./interfaces/IERC20.sol";
import {ILQCFlowFactory} from "./interfaces/ILQCFlowFactory.sol";
import {ILQCFlowPair} from "./interfaces/ILQCFlowPair.sol";
import {IWBNB} from "./interfaces/IWBNB.sol";
import {SafeTransferLib} from "./libraries/SafeTransferLib.sol";

/// @notice Token and native-BNB router for the LQC Flow MVP. Fee-on-transfer tokens are intentionally unsupported.
contract LQCFlowRouter {
    using SafeTransferLib for address;

    uint256 public constant FEE_DENOMINATOR = 10_000;
    uint256 public constant SWAP_FEE_BPS = 30;
    address public immutable factory;
    address public immutable WBNB;

    error Expired();
    error InvalidPath();
    error InsufficientAmount();
    error InsufficientOutput();
    error ExcessiveInput();
    error PairNotFound();
    error InvalidWBNBPath();
    error NativeSenderNotWBNB();

    modifier ensure(uint256 deadline) {
        if (deadline < block.timestamp) revert Expired();
        _;
    }

    constructor(address factory_, address wbnb_) {
        if (factory_ == address(0) || wbnb_ == address(0)) revert InvalidPath();
        factory = factory_;
        WBNB = wbnb_;
    }

    receive() external payable {
        if (msg.sender != WBNB) revert NativeSenderNotWBNB();
    }

    function addLiquidity(
        address tokenA,
        address tokenB,
        uint256 amountADesired,
        uint256 amountBDesired,
        uint256 amountAMin,
        uint256 amountBMin,
        address to,
        uint256 deadline
    ) external ensure(deadline) returns (uint256 amountA, uint256 amountB, uint256 liquidity) {
        address pair = ILQCFlowFactory(factory).getPair(tokenA, tokenB);
        if (pair == address(0)) pair = ILQCFlowFactory(factory).createPair(tokenA, tokenB);
        (amountA, amountB) = _liquidityAmounts(tokenA, tokenB, amountADesired, amountBDesired, amountAMin, amountBMin);
        tokenA.safeTransferFrom(msg.sender, pair, amountA);
        tokenB.safeTransferFrom(msg.sender, pair, amountB);
        liquidity = ILQCFlowPair(pair).mint(to);
    }

    function removeLiquidity(
        address tokenA,
        address tokenB,
        uint256 liquidity,
        uint256 amountAMin,
        uint256 amountBMin,
        address to,
        uint256 deadline
    ) external ensure(deadline) returns (uint256 amountA, uint256 amountB) {
        address pair = _pairFor(tokenA, tokenB);
        if (!ILQCFlowPair(pair).transferFrom(msg.sender, pair, liquidity)) revert InsufficientAmount();
        (uint256 amount0, uint256 amount1) = ILQCFlowPair(pair).burn(to);
        (address token0,) = _sortTokens(tokenA, tokenB);
        (amountA, amountB) = tokenA == token0 ? (amount0, amount1) : (amount1, amount0);
        if (amountA < amountAMin || amountB < amountBMin) revert InsufficientAmount();
    }

    function addLiquidityBNB(
        address token,
        uint256 amountTokenDesired,
        uint256 amountTokenMin,
        uint256 amountBNBMin,
        address to,
        uint256 deadline
    ) external payable ensure(deadline) returns (uint256 amountToken, uint256 amountBNB, uint256 liquidity) {
        address pair = ILQCFlowFactory(factory).getPair(token, WBNB);
        if (pair == address(0)) pair = ILQCFlowFactory(factory).createPair(token, WBNB);
        (amountToken, amountBNB) = _liquidityAmounts(
            token, WBNB, amountTokenDesired, msg.value, amountTokenMin, amountBNBMin
        );
        token.safeTransferFrom(msg.sender, pair, amountToken);
        IWBNB(WBNB).deposit{value: amountBNB}();
        WBNB.safeTransfer(pair, amountBNB);
        liquidity = ILQCFlowPair(pair).mint(to);
        if (msg.value > amountBNB) SafeTransferLib.safeTransferBNB(msg.sender, msg.value - amountBNB);
    }

    function removeLiquidityBNB(
        address token,
        uint256 liquidity,
        uint256 amountTokenMin,
        uint256 amountBNBMin,
        address to,
        uint256 deadline
    ) external ensure(deadline) returns (uint256 amountToken, uint256 amountBNB) {
        address pair = _pairFor(token, WBNB);
        if (!ILQCFlowPair(pair).transferFrom(msg.sender, pair, liquidity)) revert InsufficientAmount();
        (uint256 amount0, uint256 amount1) = ILQCFlowPair(pair).burn(address(this));
        (address token0,) = _sortTokens(token, WBNB);
        (amountToken, amountBNB) = token == token0 ? (amount0, amount1) : (amount1, amount0);
        if (amountToken < amountTokenMin || amountBNB < amountBNBMin) revert InsufficientAmount();
        token.safeTransfer(to, amountToken);
        IWBNB(WBNB).withdraw(amountBNB);
        SafeTransferLib.safeTransferBNB(to, amountBNB);
    }

    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external ensure(deadline) returns (uint256[] memory amounts) {
        amounts = getAmountsOut(amountIn, path);
        if (amounts[amounts.length - 1] < amountOutMin) revert InsufficientOutput();
        path[0].safeTransferFrom(msg.sender, _pairFor(path[0], path[1]), amounts[0]);
        _swap(amounts, path, to);
    }

    function swapTokensForExactTokens(
        uint256 amountOut,
        uint256 amountInMax,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external ensure(deadline) returns (uint256[] memory amounts) {
        amounts = getAmountsIn(amountOut, path);
        if (amounts[0] > amountInMax) revert ExcessiveInput();
        path[0].safeTransferFrom(msg.sender, _pairFor(path[0], path[1]), amounts[0]);
        _swap(amounts, path, to);
    }

    function swapExactBNBForTokens(
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external payable ensure(deadline) returns (uint256[] memory amounts) {
        if (path.length < 2 || path[0] != WBNB) revert InvalidWBNBPath();
        amounts = getAmountsOut(msg.value, path);
        if (amounts[amounts.length - 1] < amountOutMin) revert InsufficientOutput();
        IWBNB(WBNB).deposit{value: amounts[0]}();
        WBNB.safeTransfer(_pairFor(path[0], path[1]), amounts[0]);
        _swap(amounts, path, to);
    }

    function swapBNBForExactTokens(
        uint256 amountOut,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external payable ensure(deadline) returns (uint256[] memory amounts) {
        if (path.length < 2 || path[0] != WBNB) revert InvalidWBNBPath();
        amounts = getAmountsIn(amountOut, path);
        if (amounts[0] > msg.value) revert ExcessiveInput();
        IWBNB(WBNB).deposit{value: amounts[0]}();
        WBNB.safeTransfer(_pairFor(path[0], path[1]), amounts[0]);
        _swap(amounts, path, to);
        if (msg.value > amounts[0]) SafeTransferLib.safeTransferBNB(msg.sender, msg.value - amounts[0]);
    }

    function swapExactTokensForBNB(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external ensure(deadline) returns (uint256[] memory amounts) {
        if (path.length < 2 || path[path.length - 1] != WBNB) revert InvalidWBNBPath();
        amounts = getAmountsOut(amountIn, path);
        uint256 amountOut = amounts[amounts.length - 1];
        if (amountOut < amountOutMin) revert InsufficientOutput();
        path[0].safeTransferFrom(msg.sender, _pairFor(path[0], path[1]), amounts[0]);
        _swap(amounts, path, address(this));
        IWBNB(WBNB).withdraw(amountOut);
        SafeTransferLib.safeTransferBNB(to, amountOut);
    }

    function swapTokensForExactBNB(
        uint256 amountOut,
        uint256 amountInMax,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external ensure(deadline) returns (uint256[] memory amounts) {
        if (path.length < 2 || path[path.length - 1] != WBNB) revert InvalidWBNBPath();
        amounts = getAmountsIn(amountOut, path);
        if (amounts[0] > amountInMax) revert ExcessiveInput();
        path[0].safeTransferFrom(msg.sender, _pairFor(path[0], path[1]), amounts[0]);
        _swap(amounts, path, address(this));
        IWBNB(WBNB).withdraw(amountOut);
        SafeTransferLib.safeTransferBNB(to, amountOut);
    }

    function quote(uint256 amountA, uint256 reserveA, uint256 reserveB) public pure returns (uint256 amountB) {
        if (amountA == 0 || reserveA == 0 || reserveB == 0) revert InsufficientAmount();
        amountB = amountA * reserveB / reserveA;
    }

    function getAmountOut(uint256 amountIn, uint256 reserveIn, uint256 reserveOut) public pure returns (uint256 amountOut) {
        if (amountIn == 0 || reserveIn == 0 || reserveOut == 0) revert InsufficientAmount();
        uint256 amountInWithFee = amountIn * (FEE_DENOMINATOR - SWAP_FEE_BPS);
        amountOut = amountInWithFee * reserveOut / (reserveIn * FEE_DENOMINATOR + amountInWithFee);
    }

    function getAmountIn(uint256 amountOut, uint256 reserveIn, uint256 reserveOut) public pure returns (uint256 amountIn) {
        if (amountOut == 0 || reserveIn == 0 || reserveOut <= amountOut) revert InsufficientAmount();
        amountIn = reserveIn * amountOut * FEE_DENOMINATOR
            / ((reserveOut - amountOut) * (FEE_DENOMINATOR - SWAP_FEE_BPS)) + 1;
    }

    function getAmountsOut(uint256 amountIn, address[] calldata path) public view returns (uint256[] memory amounts) {
        if (path.length < 2) revert InvalidPath();
        amounts = new uint256[](path.length);
        amounts[0] = amountIn;
        for (uint256 i; i < path.length - 1; ++i) {
            (uint256 reserveIn, uint256 reserveOut) = _getReserves(path[i], path[i + 1]);
            amounts[i + 1] = getAmountOut(amounts[i], reserveIn, reserveOut);
        }
    }

    function getAmountsIn(uint256 amountOut, address[] calldata path) public view returns (uint256[] memory amounts) {
        if (path.length < 2) revert InvalidPath();
        amounts = new uint256[](path.length);
        amounts[path.length - 1] = amountOut;
        for (uint256 i = path.length - 1; i > 0; --i) {
            (uint256 reserveIn, uint256 reserveOut) = _getReserves(path[i - 1], path[i]);
            amounts[i - 1] = getAmountIn(amounts[i], reserveIn, reserveOut);
        }
    }

    function _liquidityAmounts(
        address tokenA,
        address tokenB,
        uint256 amountADesired,
        uint256 amountBDesired,
        uint256 amountAMin,
        uint256 amountBMin
    ) private view returns (uint256 amountA, uint256 amountB) {
        (uint256 reserveA, uint256 reserveB) = _getReservesOptional(tokenA, tokenB);
        if (reserveA == 0 && reserveB == 0) return (amountADesired, amountBDesired);
        uint256 amountBOptimal = quote(amountADesired, reserveA, reserveB);
        if (amountBOptimal <= amountBDesired) {
            if (amountBOptimal < amountBMin) revert InsufficientAmount();
            return (amountADesired, amountBOptimal);
        }
        uint256 amountAOptimal = quote(amountBDesired, reserveB, reserveA);
        if (amountAOptimal > amountADesired || amountAOptimal < amountAMin) revert InsufficientAmount();
        return (amountAOptimal, amountBDesired);
    }

    function _swap(uint256[] memory amounts, address[] calldata path, address finalTo) private {
        for (uint256 i; i < path.length - 1; ++i) {
            (address input, address output) = (path[i], path[i + 1]);
            (address token0,) = _sortTokens(input, output);
            uint256 amountOut = amounts[i + 1];
            (uint256 amount0Out, uint256 amount1Out) = input == token0 ? (uint256(0), amountOut) : (amountOut, uint256(0));
            address to = i < path.length - 2 ? _pairFor(output, path[i + 2]) : finalTo;
            ILQCFlowPair(_pairFor(input, output)).swap(amount0Out, amount1Out, to);
        }
    }

    function _getReserves(address tokenA, address tokenB) private view returns (uint256 reserveA, uint256 reserveB) {
        address pair = _pairFor(tokenA, tokenB);
        (uint112 reserve0, uint112 reserve1,) = ILQCFlowPair(pair).getReserves();
        (address token0,) = _sortTokens(tokenA, tokenB);
        (reserveA, reserveB) = tokenA == token0 ? (reserve0, reserve1) : (reserve1, reserve0);
    }

    function _getReservesOptional(address tokenA, address tokenB) private view returns (uint256 reserveA, uint256 reserveB) {
        address pair = ILQCFlowFactory(factory).getPair(tokenA, tokenB);
        if (pair == address(0)) return (0, 0);
        (uint112 reserve0, uint112 reserve1,) = ILQCFlowPair(pair).getReserves();
        (address token0,) = _sortTokens(tokenA, tokenB);
        (reserveA, reserveB) = tokenA == token0 ? (reserve0, reserve1) : (reserve1, reserve0);
    }

    function _pairFor(address tokenA, address tokenB) private view returns (address pair) {
        pair = ILQCFlowFactory(factory).getPair(tokenA, tokenB);
        if (pair == address(0)) revert PairNotFound();
    }

    function _sortTokens(address tokenA, address tokenB) private pure returns (address token0, address token1) {
        if (tokenA == tokenB || tokenA == address(0) || tokenB == address(0)) revert InvalidPath();
        (token0, token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
    }
}
