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
    uint256 public constant MAX_HOPS = 3;
    address public owner;
    address public pendingOwner;
    mapping(uint24 => bool) public allowedFeeTiers;
    mapping(bytes32 => bool) public allowedPools;

    event FeeTierStatusChanged(uint24 indexed fee, bool allowed);
    event PoolStatusChanged(address indexed token0, address indexed token1, uint24 indexed fee, bool allowed);
    event OwnershipTransferStarted(address indexed owner, address indexed pendingOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    error ZeroAddress();
    error InvalidRoute();
    error RouteEndpointMismatch();
    error QuoteFailed();
    error Expired();
    error InsufficientOutput();
    error Forbidden();
    error TooManyHops();
    error FeeTierNotAllowed();
    error PoolNotAllowed();

    modifier onlyOwner() {
        if (msg.sender != owner) revert Forbidden();
        _;
    }

    constructor(address quoterV2_, address swapRouter_, address owner_) {
        if (quoterV2_ == address(0) || swapRouter_ == address(0) || owner_ == address(0)) revert ZeroAddress();
        quoterV2 = quoterV2_;
        swapRouter = IPancakeV3SwapRouter(swapRouter_);
        owner = owner_;
        emit OwnershipTransferred(address(0), owner_);
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

    function _validateRoute(address tokenIn, address tokenOut, bytes calldata routeData) private view {
        if (routeData.length < 43 || (routeData.length - 20) % 23 != 0) revert InvalidRoute();
        uint256 hops = (routeData.length - 20) / 23;
        if (hops > MAX_HOPS) revert TooManyHops();
        address first = address(bytes20(routeData[0:20]));
        address last = address(bytes20(routeData[routeData.length - 20:routeData.length]));
        if (first != tokenIn || last != tokenOut) revert RouteEndpointMismatch();
        address current = first;
        for (uint256 i; i < hops; ++i) {
            uint256 offset = 20 + i * 23;
            uint24 fee = uint24(bytes3(routeData[offset:offset + 3]));
            address next = address(bytes20(routeData[offset + 3:offset + 23]));
            if (!allowedFeeTiers[fee]) revert FeeTierNotAllowed();
            if (!allowedPools[_poolKey(current, next, fee)]) revert PoolNotAllowed();
            current = next;
        }
    }

    function setFeeTierAllowed(uint24 fee, bool allowed) external onlyOwner {
        if (fee == 0 || fee >= 1_000_000) revert InvalidRoute();
        allowedFeeTiers[fee] = allowed;
        emit FeeTierStatusChanged(fee, allowed);
    }

    function setPoolAllowed(address tokenA, address tokenB, uint24 fee, bool allowed) external onlyOwner {
        if (tokenA == address(0) || tokenB == address(0)) revert ZeroAddress();
        if (tokenA == tokenB || !allowedFeeTiers[fee]) revert InvalidRoute();
        (address token0, address token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
        allowedPools[keccak256(abi.encode(token0, token1, fee))] = allowed;
        emit PoolStatusChanged(token0, token1, fee, allowed);
    }

    function beginOwnershipTransfer(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        pendingOwner = newOwner;
        emit OwnershipTransferStarted(owner, newOwner);
    }

    function acceptOwnership() external {
        if (msg.sender != pendingOwner) revert Forbidden();
        address previous = owner;
        owner = msg.sender;
        pendingOwner = address(0);
        emit OwnershipTransferred(previous, msg.sender);
    }

    function poolKey(address tokenA, address tokenB, uint24 fee) external pure returns (bytes32) {
        return _poolKey(tokenA, tokenB, fee);
    }

    function _poolKey(address tokenA, address tokenB, uint24 fee) private pure returns (bytes32) {
        (address token0, address token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
        return keccak256(abi.encode(token0, token1, fee));
    }
}
